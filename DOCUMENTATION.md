# Routism Social — Complete Project Documentation

**Product:** Routism Social  
**Version scope:** Instagram single-image publishing & scheduling (v1)  
**Stack:** React (Vite) dashboard · Express (TypeScript) API · MySQL/MariaDB · Cloudinary · Instagram Graph API · MCP · ChatGPT Actions

This document describes architecture, end-to-end flows, REST APIs, MCP tools, data model, environment variables, security, and deployment.

---

## Table of contents

1. [Overview](#1-overview)
2. [Repository structure](#2-repository-structure)
3. [Architecture](#3-architecture)
4. [End-to-end flows](#4-end-to-end-flows)
5. [Dashboard routes (frontend)](#5-dashboard-routes-frontend)
6. [REST API reference](#6-rest-api-reference)
7. [MCP (ChatGPT / remote agents)](#7-mcp-chatgpt--remote-agents)
8. [Database schema](#8-database-schema)
9. [Post lifecycle & statuses](#9-post-lifecycle--statuses)
10. [Environment variables](#10-environment-variables)
11. [Security model](#11-security-model)
12. [Third-party integrations](#12-third-party-integrations)
13. [Local development](#13-local-development)
14. [Production deployment](#14-production-deployment)
15. [Scripts & tooling](#15-scripts--tooling)
16. [Troubleshooting](#16-troubleshooting)
17. [ChatGPT Plugin/App + Scheduled Tasks](#17-chatgpt-pluginapp--scheduled-tasks-integration)

---

## 1. Overview

Routism Social is a multi-tenant publishing platform. Users:

1. Register / sign in
2. Connect an Instagram **professional** account (via Facebook Page + Meta OAuth)
3. Upload JPEG media (stored on Cloudinary)
4. Compose captions, create drafts, schedule, publish, cancel, or retry
5. Optionally control the same capabilities remotely via **MCP** (e.g. ChatGPT Business / Enterprise custom MCP)

**Important design rule:** Website UI, cron scheduler, and MCP tools all call the same core service:

```ts
publishPost(postId, userId)
```

Ownership is always enforced as `user_id = authenticated user`. Tools never accept a trusted `userId` from the client.

---

## 2. Repository structure

```
routism-social/
├── apps/dashboard/          # React + Vite + Tailwind SPA
│   ├── public/robots.txt
│   ├── src/pages/           # Login, Overview, Composer, Queue, Media, Accounts, Settings, Privacy
│   ├── src/services/api.ts  # Axios client (cookie credentials)
│   └── .env.production      # VITE_API_BASE_URL (baked at build)
├── server/                  # Express API + scheduler + MCP
│   ├── src/routes/          # REST routers
│   ├── src/controllers/
│   ├── src/services/        # Auth, accounts, media, posts, publish, scheduler, Cloudinary, Instagram
│   ├── src/mcp/             # MCP Streamable HTTP + OAuth 2.1
│   ├── src/integrations/    # ChatGPT Actions + shared publishingActions
│   └── scripts/             # migrate, seed, start-render, mcp helpers
├── shared/                  # Shared TypeScript types (@routism/shared)
├── database/migrations/     # 001_init.sql, 002_mcp_oauth.sql, 003_chatgpt_integration.sql
├── vercel.json              # Dashboard deploy (Vercel)
├── render.yaml              # API deploy blueprint (Render)
├── DOCUMENTATION.md         # This file
└── README.md                # Quick start
```

**Workspaces (npm):** `apps/dashboard`, `server`, `shared`

---

## 3. Architecture

```
┌─────────────────────────────┐
│  Dashboard (Vercel)         │
│  https://…vercel.app        │
│  Cookie session → API       │
└──────────────┬──────────────┘
               │ HTTPS + credentials
               v
┌─────────────────────────────┐     ┌──────────────────┐
│  API (Render)               │────►│ MySQL / MariaDB  │
│  Express + node-cron        │     │ (e.g. Hostinger) │
│  /api/*  REST               │     └──────────────────┘
│  /mcp    MCP Streamable HTTP│
│  /integrations/chatgpt      │────► Cloudinary (unsigned upload)
│  OAuth AS + ChatGPT Actions │
└──────────────┬──────────────┘
               │
               v
        Instagram Graph API
        (Meta / Facebook Login)
```

| Layer | Role |
|-------|------|
| Dashboard | SPA for humans; public `/privacy-policy`; auth-gated app shell |
| API | Auth, CRUD, publish, schedule, Instagram OAuth callback, MCP |
| Scheduler | Cron every minute; claims due `scheduled` posts → `publishPost` |
| Shared | Public DTO / status types |

---

## 4. End-to-end flows

### 4.1 User registration & login

1. User opens `/register` or `/login` on the dashboard.
2. Dashboard `POST`s to API `/api/auth/register` or `/api/auth/login` with JSON body.
3. Server validates input, hashes password (`bcrypt`), creates/loads `rs_users`.
4. Server sets HTTP-only cookie `routism_session` (HMAC-signed payload).
5. Subsequent requests send the cookie (`withCredentials: true`).
6. CSRF: mutating requests must include an `Origin`/`Referer` allowed by `CORS_ORIGIN`.

**Production cookies:** `Secure` + `SameSite=None` (cross-site dashboard ↔ API).

### 4.2 Connect Instagram

1. Authenticated user opens **Connected Accounts** → Connect Instagram.
2. Dashboard navigates to `GET /api/accounts/instagram/connect` (cookie auth).
3. Server creates one-time `rs_oauth_states` row and redirects to Meta OAuth dialog.
4. User grants permissions on Meta.
5. Meta redirects to:
   `GET {API}/api/accounts/instagram/callback?code=…&state=…`
6. Server exchanges code → short-lived → long-lived token.
7. Server lists Facebook Pages (`/me/accounts`), finds Page with linked Instagram Business/Creator account.
8. Encrypts page access token (AES-256-GCM) into `rs_accounts`.
9. Redirects browser to `{APP_BASE_URL}/accounts?connected=1`.

**Requirements for success:**

- Instagram account is **Professional** (Business or Creator)
- Linked to a **Facebook Page**
- Facebook user is Page admin
- Meta app has redirect URI + App Domains configured
- Render `INSTAGRAM_REDIRECT_URI` matches Meta whitelist **exactly** (not localhost in production)

### 4.3 Upload media

1. User selects JPEG on **Media** or **Composer**.
2. Dashboard `POST /api/media` as `multipart/form-data` field `file`.
3. Server uploads to Cloudinary **unsigned** preset.
4. Metadata saved in `rs_media` (secure URL, dimensions, mime, size).
5. Client receives `mediaId` for post creation.

### 4.4 Compose → schedule → publish (dashboard)

```
Upload media → Create draft (caption + mediaId)
       → Schedule (date/time + timezone)  OR  Publish now
       → Scheduler / publishPost → Instagram Graph
       → Delivery row + status update
```

1. **Create draft:** `POST /api/posts` `{ caption, mediaId }` → status `draft`
2. **Schedule:** `POST /api/posts/:id/schedule` `{ date, time, timezone }` → status `scheduled`, UTC `scheduled_at` stored
3. **Publish now:** `POST /api/posts/:id/publish` → `publishPost`
4. **Cancel schedule:** `POST /api/posts/:id/cancel` → back to `draft`
5. **Retry failed:** `POST /api/posts/:id/retry`

### 4.5 Scheduler flow

1. `node-cron` runs every minute (`* * * * *`).
2. Claims posts where `status = scheduled` and `scheduled_at <= now`.
3. Calls `publishPost(postId, userId)` for each claim.
4. Success → `published` + delivery `remote_post_id`; failure → `failed` / `needs_review` with error message.

### 4.6 Publish pipeline (`publishPost`)

High-level steps inside the shared publisher:

1. Load post + media; verify ownership and publishable status.
2. Load connected Instagram account; decrypt access token (refresh if needed).
3. Create Instagram media container (`image_url` + caption).
4. Wait until container is ready.
5. Publish container.
6. Persist delivery result and post status.
7. Duplicate-publish protection / status guards prevent double posts where possible.

### 4.7 MCP remote control flow

1. Client (e.g. ChatGPT custom MCP) discovers:
   - `GET /.well-known/oauth-authorization-server`
   - `GET /.well-known/oauth-protected-resource/mcp`
2. Dynamic client registration: `POST /register` (when used).
3. Authorization: `GET /authorize` → `/mcp/oauth/login` (Routism email/password consent).
4. Code + PKCE exchanged at `POST /token` → access + refresh tokens (hashed in DB).
5. Client calls `POST /mcp` with `Authorization: Bearer <access_token>`.
6. Server resolves `userId` from token; tools wrap existing services.

**ChatGPT availability:** Custom MCP / Developer mode is **not** available on free ChatGPT. Full write MCP is aimed at Business / Enterprise / Edu (see OpenAI docs). Free users should use the dashboard or MCP Inspector.

---

## 5. Dashboard routes (frontend)

| Path | Auth | Description |
|------|------|-------------|
| `/login` | Public | Sign in |
| `/register` | Public | Create account |
| `/privacy-policy` | Public | Privacy Policy |
| `/` | Required | Overview / stats |
| `/queue` | Required | Publishing queue |
| `/composer` | Required | Create / schedule / publish |
| `/media` | Required | Media library |
| `/accounts` | Required | Instagram connect / disconnect |
| `/settings` | Required | Profile timezone, integration status |

**API base URL:** `import.meta.env.VITE_API_BASE_URL`  
Empty in local dev (Vite proxy to `:4000`). Production must be absolute, e.g. `https://rsocial-eb5m.onrender.com`.

**Optional:** `VITE_PRIVACY_CONTACT_EMAIL` for Privacy Policy contact section.

---

## 6. REST API reference

**Base URL (prod example):** `https://rsocial-eb5m.onrender.com`  
**Content-Type:** `application/json` (except media upload)  
**Auth:** Cookie `routism_session` unless noted  
**CORS:** Origins listed in `CORS_ORIGIN` (comma-separated), credentials enabled  

### Response envelope

Success:

```json
{
  "success": true,
  "data": { }
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

Common headers: `X-Request-Id`

---

### 6.1 Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | No | Liveness; reports MCP path |

---

### 6.2 Auth — `/api/auth`

| Method | Path | Auth | Body / notes |
|--------|------|------|----------------|
| `POST` | `/api/auth/register` | No (rate limited) | `{ name, email, password, timezone? }` → sets session cookie; `201` |
| `POST` | `/api/auth/login` | No (rate limited) | `{ email, password }` → sets session cookie |
| `POST` | `/api/auth/logout` | Cookie optional | Clears session cookie |
| `GET` | `/api/auth/me` | Yes | Current user |

**Password:** min 8 characters.

---

### 6.3 Dashboard — `/api/dashboard`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/dashboard` | Yes | Stats, recent/upcoming posts, accounts, recent deliveries |

Response `data` shape matches `DashboardData` in `@routism/shared`.

---

### 6.4 Accounts — `/api/accounts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/accounts` | Yes | List connected accounts (no raw tokens) |
| `GET` | `/api/accounts/instagram/connect` | Yes | Starts OAuth; **redirect** to Meta |
| `GET` | `/api/accounts/instagram/callback` | No (state-bound) | Meta redirect; exchanges code; **redirect** to dashboard |
| `DELETE` | `/api/accounts/:id` | Yes | Disconnect account |

---

### 6.5 Media — `/api/media`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/media` | Yes | List media; optional `?search=` |
| `POST` | `/api/media` | Yes (rate limited) | `multipart/form-data` field `file` (JPEG); `201` |
| `GET` | `/api/media/:id` | Yes | Get one media asset |
| `DELETE` | `/api/media/:id` | Yes | Delete media metadata (ownership checked) |

---

### 6.6 Posts — `/api/posts`

| Method | Path | Auth | Body / query |
|--------|------|------|----------------|
| `GET` | `/api/posts` | Yes | `?status=draft\|scheduled\|published\|failed\|needs_review\|all` |
| `POST` | `/api/posts` | Yes | `{ caption, mediaId }` → draft; `201` |
| `GET` | `/api/posts/:id` | Yes | Post + deliveries |
| `PATCH` | `/api/posts/:id` | Yes | `{ caption?, mediaId? }` |
| `POST` | `/api/posts/:id/publish` | Yes (rate limited) | Publish now |
| `POST` | `/api/posts/:id/schedule` | Yes | `{ date: YYYY-MM-DD, time: HH:mm or HH:mm:ss, timezone }` |
| `POST` | `/api/posts/:id/cancel` | Yes | Cancel scheduled → draft |
| `POST` | `/api/posts/:id/retry` | Yes (rate limited) | Retry failed publish |

**Caption:** 1–2200 characters.  
**mediaId:** UUID of owned media.

---

### 6.7 Settings — `/api/settings`

| Method | Path | Auth | Body |
|--------|------|------|------|
| `GET` | `/api/settings` | Yes | Account + Instagram + Cloudinary status (secrets masked) |
| `PATCH` | `/api/settings` | Yes | `{ name?, timezone? }` |

---

## 7. MCP (ChatGPT / remote agents)

### 7.1 Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/.well-known/oauth-authorization-server` | OAuth AS metadata (`issuer` = `API_BASE_URL`) |
| `GET` | `/.well-known/oauth-protected-resource/mcp` | Protected resource metadata |
| `GET` | `/authorize` | OAuth authorize |
| `POST` | `/token` | Token exchange / refresh |
| `POST` | `/register` | Dynamic client registration |
| `POST` | `/revoke` | Token revocation |
| `GET` | `/mcp/oauth/login` | HTML login/consent UI |
| `POST` | `/mcp/oauth/login` | Submit credentials / approve |
| `POST` / `GET` / `DELETE` | `/mcp` | Streamable HTTP MCP (Bearer `mcp:tools`) |

**Production MCP URL example:** `https://rsocial-eb5m.onrender.com/mcp`

`API_BASE_URL` **must** be the public HTTPS API origin. If it is `http://localhost:4000`, OAuth metadata breaks ChatGPT and other remote clients.

### 7.2 Tools

| Tool | Read/Write | Inputs | Behavior |
|------|------------|--------|----------|
| `list_connected_accounts` | Read | — | Platform, username, status (no tokens) |
| `upload_image` | Write | `imageBase64`, optional `mimeType`, `filename` | JPEG → Cloudinary → `{ mediaId, secureUrl, … }` |
| `create_post` | Write | `caption`, `mediaId` | Creates draft |
| `schedule_post` | Write | `postId`, `scheduledAt`, `timezone?` | Schedules future publish |
| `publish_post` | Write (destructive) | `postId` | Immediate Instagram publish |
| `get_post_status` | Read | `postId` | Status, schedule, remote id |
| `cancel_post` | Write (destructive) | `postId` | Scheduled → draft |

All tools bind to the OAuth-authenticated Routism user. Never pass Instagram tokens to the model.

### 7.3 Local MCP testing

```bash
npm run migrate
npm run dev:server
npm run mcp:token -- --email you@example.com --password 'your-password'
# set MCP_TOKEN=<accessToken>
npm run mcp:smoke
```

Or use MCP Inspector against `http://localhost:4000/mcp` with Bearer token.

---

## 8. Database schema

Migrations: `database/migrations/`  
Runner: `npm run migrate`  
Tables use prefix `rs_` to avoid collisions on shared hosting databases.

### Core tables (`001_init.sql`)

| Table | Purpose |
|-------|---------|
| `rs_users` | Accounts (email, password hash, name, timezone) |
| `rs_accounts` | Connected social accounts + encrypted tokens |
| `rs_oauth_states` | One-time Instagram OAuth `state` values |
| `rs_media` | Cloudinary media metadata |
| `rs_posts` | Drafts / schedules / publish state |
| `rs_deliveries` | Per-account delivery attempts & remote IDs |
| `schema_migrations` | Applied migration versions |

### MCP OAuth tables (`002_mcp_oauth.sql`)

| Table | Purpose |
|-------|---------|
| `rs_mcp_clients` | Registered OAuth clients |
| `rs_mcp_pending_auth` | In-flight authorize sessions |
| `rs_mcp_auth_codes` | Auth codes (hashed) |
| `rs_mcp_tokens` | Access / refresh tokens (hashed) |

### ChatGPT + idempotency (`003_chatgpt_integration.sql`)

| Table | Purpose |
|-------|---------|
| `rs_chatgpt_connections` | Active/revoked ChatGPT ↔ Routism user links |
| `rs_idempotency_keys` | Cached responses for external write retries |

---

## 9. Post lifecycle & statuses

### Post status (`PostStatus`)

| Status | Meaning |
|--------|---------|
| `draft` | Created, not scheduled |
| `scheduled` | Waiting for `scheduled_at` |
| `publishing` | In flight |
| `published` | Successfully published |
| `failed` | Publish failed |
| `needs_review` | Needs human attention after error |

### Delivery status (`DeliveryStatus`)

`pending` → `publishing` → `published` | `failed`

### Typical transitions

```
draft ──publish──► published
draft ──schedule──► scheduled ──cron/publish──► published
scheduled ──cancel──► draft
failed / needs_review ──retry──► published (or failed again)
```

---

## 10. Environment variables

### API / server (Render + local `.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `development` / `production` / `test` |
| `PORT` | No | Default `4000` |
| `APP_BASE_URL` | Yes | Dashboard origin (OAuth return, links) |
| `API_BASE_URL` | Yes | Public API origin (**issuer for MCP**) |
| `DATABASE_HOST` | Yes | MySQL host |
| `DATABASE_PORT` | No | Default `3306` |
| `DATABASE_NAME` | Yes | Database name |
| `DATABASE_USER` | Yes | DB user |
| `DATABASE_PASSWORD` | Yes | DB password |
| `JWT_SECRET` | Yes | ≥16 chars |
| `SESSION_SECRET` | Yes | ≥16 chars (cookie HMAC) |
| `ENCRYPTION_KEY` | Yes | 32+ chars; AES key material for IG tokens |
| `CLOUDINARY_CLOUD_NAME` | No* | Default may be set; set your cloud |
| `CLOUDINARY_UPLOAD_PRESET` | No* | Unsigned preset name |
| `INSTAGRAM_CLIENT_ID` | For IG | Meta App ID |
| `INSTAGRAM_CLIENT_SECRET` | For IG | Meta App Secret |
| `INSTAGRAM_REDIRECT_URI` | For IG | Exact callback URL |
| `COOKIE_SECURE` | Prod | `true` in production |
| `CORS_ORIGIN` | Yes | Dashboard origin(s), comma-separated |
| `DEFAULT_TIMEZONE` | No | Default `Asia/Kolkata` |
| `MCP_CORS_ORIGINS` | No | Extra CORS for MCP browsers (`*` allowed) |
| `CHATGPT_ACTIONS_CLIENT_ID` | For ChatGPT Actions | OAuth client id |
| `CHATGPT_ACTIONS_CLIENT_SECRET` | For ChatGPT Actions | OAuth client secret |
| `CHATGPT_ACTIONS_REDIRECT_URIS` | No | Comma-separated redirect allowlist prefixes |

\* Required for media uploads in practice.

### Dashboard (Vercel / Vite)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | Prod | Absolute API origin, no trailing slash |
| `VITE_PRIVACY_CONTACT_EMAIL` | No | Privacy Policy contact |

Vite bakes `VITE_*` at **build time** — change → redeploy.

### Production examples

```env
APP_BASE_URL=https://routism-social.vercel.app
API_BASE_URL=https://rsocial-eb5m.onrender.com
CORS_ORIGIN=https://routism-social.vercel.app
COOKIE_SECURE=true
INSTAGRAM_REDIRECT_URI=https://rsocial-eb5m.onrender.com/api/accounts/instagram/callback
VITE_API_BASE_URL=https://rsocial-eb5m.onrender.com
```

---

## 11. Security model

| Control | Implementation |
|---------|----------------|
| Passwords | bcrypt hashes |
| Sessions | HTTP-only cookie, HMAC-signed payload |
| CSRF | Origin/Referer allowlist on mutating routes |
| Instagram tokens | AES-256-GCM at rest; decrypt only on server |
| MCP tokens | Stored hashed; scoped `mcp:tools` |
| Ownership | All post/media/account ops filter by `user_id` |
| Rate limits | Login, OAuth, upload, publish/retry |
| Helmet | Enabled (CSP disabled for practicality) |
| Secrets | Never returned to dashboard or MCP tool results |
| Logging | Tokens redacted where possible |

CSRF exemptions include MCP/OAuth paths and Instagram OAuth callback.

---

## 12. Third-party integrations

### Meta / Instagram

- Facebook Login + Instagram Graph permissions (e.g. `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management`)
- Valid OAuth Redirect URI must match `INSTAGRAM_REDIRECT_URI`
- App Domains must include API host (e.g. `rsocial-eb5m.onrender.com`)

### Cloudinary

- Unsigned upload preset (no API secret in app)
- Server proxies upload from authenticated user

### Hosting (current production pattern)

| Component | Host |
|-----------|------|
| Dashboard | Vercel SPA |
| API + MCP + cron | Render (long-lived Node) |
| Database | Hostinger MySQL/MariaDB |

The API **must not** run as Vercel serverless — it needs a persistent process for cron + MCP sessions.

---

## 13. Local development

### Prerequisites

- Node.js 20+
- MySQL 8+ / MariaDB 10.5+
- Cloudinary unsigned preset
- Meta app (optional for IG connect locally)

### Setup

```bash
npm install
cp .env.example .env   # if present; otherwise create .env from section 10
# fill DATABASE_*, secrets, APP_BASE_URL=http://localhost:5173
# API_BASE_URL=http://localhost:4000
# CORS_ORIGIN=http://localhost:5173
# COOKIE_SECURE=false
# INSTAGRAM_REDIRECT_URI=http://localhost:4000/api/accounts/instagram/callback

npm run migrate
npm run seed:user      # optional admin seed
npm run dev            # API :4000 + dashboard :5173
```

Generate encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 14. Production deployment

### Dashboard (Vercel)

- Root monorepo; `vercel.json` runs:
  - `installCommand`: `npm install --include=dev`
  - `buildCommand`: build `shared` + `apps/dashboard`
  - `outputDirectory`: `apps/dashboard/dist`
- Env: `VITE_API_BASE_URL`
- SPA rewrite to `index.html` (except assets)
- Public pages: `/login`, `/register`, `/privacy-policy`

### API (Render)

- `rootDir`: `server` (see `render.yaml`)
- Build: `npm run build:render` (includes types / tsc)
- Start: `npm start` (via start script)
- Health check: `/api/health`
- Set all server env vars; **redeploy after any `API_BASE_URL` / Instagram redirect change**

### Post-deploy checklist

1. `GET /api/health` → OK  
2. Dashboard login works (no 405 to Vercel `/api/...`)  
3. OAuth metadata issuer is HTTPS API URL (not localhost)  
4. Instagram connect completes with Page + IG pro account  
5. Upload JPEG → create → publish or schedule  
6. Cron publishes due posts  
7. MCP Inspector or paid ChatGPT MCP can authenticate  

---

## 15. Scripts & tooling

| Command | Description |
|---------|-------------|
| `npm run dev` | API + dashboard concurrently |
| `npm run dev:server` | API only |
| `npm run dev:dashboard` | Dashboard only |
| `npm run build` | Build shared + server + dashboard |
| `npm run build:server` | Build shared + server |
| `npm run start` | Start compiled API |
| `npm run migrate` | Apply SQL migrations |
| `npm run seed:user` | Seed a user |
| `npm run mcp:token` | Mint MCP access token for testing |
| `npm run mcp:smoke` | Smoke-test MCP tools |
| `npm run lint` | Typecheck packages |
| `npm run test` | Server tests |

---

## 16. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Login `405` on `*.vercel.app/api/...` | Missing `VITE_API_BASE_URL` | Set env + redeploy Vercel |
| Vercel build missing `@types/react` | Prod install skips devDeps | Keep types/build tools in dashboard `dependencies` + `--include=dev` |
| Instagram “URL blocked” / domain error | Redirect URI mismatch | Align Meta whitelist + Render `INSTAGRAM_REDIRECT_URI` |
| OAuth URL still has `localhost` | Render still has local redirect/API URL | Update Render env + restart |
| “No Facebook Pages found” | No Page / not linked / wrong FB user | Link IG pro ↔ Page; login as Page admin |
| MCP metadata shows localhost issuer | `API_BASE_URL` wrong on Render | Set to public HTTPS API URL |
| ChatGPT free: no Developer mode | Plan limitation | Use dashboard, Inspector, or Business/Enterprise ChatGPT |
| CSRF / CORS errors | Origin not allowlisted | Set `CORS_ORIGIN` to exact dashboard origin |
| FK errno 150 on migrate | Table name collision | Use `rs_` migrations (already applied in this repo) |
| Render missing `dist` / types | Incomplete build | Use `build:render` / include TypeScript types in deploy install |

---

## 17. ChatGPT Plugin/App + Scheduled Tasks Integration

This section describes the **ChatGPT Custom GPT Actions / Plugin** path. It is separate from, and does **not** replace, the existing MCP Streamable HTTP integration.

### 17.1 Capability reality (important)

| Surface | Notes |
|---------|--------|
| **Routism dashboard** | Always works; source of truth for Instagram connect |
| **ChatGPT Custom GPT Actions** | OAuth + OpenAPI actions; typically requires a ChatGPT plan that supports custom GPTs/Actions (not Free) |
| **ChatGPT Scheduled Tasks** | Can call the connected GPT/actions when the user’s plan supports tasks |
| **Full custom MCP write** | Business / Enterprise / Edu oriented; **not** assumed for Free users |
| **Existing `/mcp`** | Remains available for MCP-capable clients |

Do **not** claim Free ChatGPT has full custom MCP write access. Routism never bypasses ChatGPT plan restrictions.

### 17.2 Architecture

```
ChatGPT Scheduled Task / Custom GPT
        │
        ▼
Routism ChatGPT Actions (OAuth Bearer)
  /integrations/chatgpt/v1/*
        │
        ▼
shared publishingActions (userId from token)
        │
        ▼
existing services → publishPost(postId, userId)
        │
        ▼
Instagram Graph API   OR   node-cron → publishPost for scheduled
```

Dashboard, MCP, ChatGPT Actions, and the scheduler **all** use the same `publishPost()` implementation.

### 17.3 Connection / OAuth flow

1. User creates or opens a Custom GPT configured with Routism Actions.
2. ChatGPT opens:
   `GET {API_BASE_URL}/integrations/chatgpt/oauth/authorize`
3. User signs in on Routism authorize page and grants access.
4. Routism redirects to ChatGPT with `code`.
5. ChatGPT exchanges code at:
   `POST {API_BASE_URL}/integrations/chatgpt/oauth/token`
6. Bearer access token (+ refresh) is stored by ChatGPT; Routism stores hashed tokens and an `rs_chatgpt_connections` row.
7. Subsequent action calls send `Authorization: Bearer …`.

Users never paste bearer tokens manually.

**Env (API):**

| Variable | Purpose |
|----------|---------|
| `CHATGPT_ACTIONS_CLIENT_ID` | OAuth client id (same value in GPT builder) |
| `CHATGPT_ACTIONS_CLIENT_SECRET` | OAuth client secret |
| `CHATGPT_ACTIONS_REDIRECT_URIS` | Optional comma-separated allowlist prefixes (defaults include `https://chatgpt.com/aip` and `https://chat.openai.com/aip`) |

**OpenAPI:** `GET {API_BASE_URL}/integrations/chatgpt/openapi.json`

### 17.4 Actions (REST)

Base path: `/integrations/chatgpt/v1`  
Auth: Bearer (`chatgpt:actions` or compatible `mcp:tools` token)  
Optional header: `Idempotency-Key` on writes

| Method | Path | Operation | Description |
|--------|------|-----------|-------------|
| `GET` | `/accounts` | `list_connected_accounts` | Safe account list |
| `POST` | `/media/upload` | `upload_media` | JPEG base64 → Cloudinary → `mediaId` |
| `POST` | `/posts` | `create_post` | Draft only |
| `POST` | `/posts/schedule` | `schedule_post` | Future publish via Routism scheduler |
| `POST` | `/posts/publish` | `publish_post` | Immediate via `publishPost()` |
| `POST` | `/posts/cancel` | `cancel_scheduled_post` | Scheduled → draft |
| `GET` | `/posts/status?postId=` | `get_post_status` | Status / remote id |
| `GET` | `/posts/scheduled` | `list_scheduled_posts` | Upcoming schedules |
| `POST` | `/posts/retry` | `retry_post` | Failed / needs_review |

Responses are minimal JSON envelopes (`success` + `data`). Never include Instagram tokens, encryption keys, or DB credentials.

### 17.5 Shared code

| Layer | Path |
|-------|------|
| Shared actions | `server/src/integrations/shared/publishingActions.ts` |
| Idempotency | `server/src/services/idempotency/idempotencyService.ts` |
| ChatGPT OAuth + REST | `server/src/integrations/chatgpt/` |
| MCP tools | `server/src/mcp/tools.ts` (calls shared actions) |

### 17.6 Idempotency

Table: `rs_idempotency_keys` (unique on `user_id + idempotency_key + operation`).  
Same key + same body → cached result. Same key + different body → `IDEMPOTENCY_CONFLICT`.  
Publish also remains protected by delivery `idempotency_key` / lock tokens inside `publishPost()`.

### 17.7 Timezone

Default timezone = Routism user profile timezone (e.g. `Asia/Kolkata`).  
`scheduledAt` is interpreted in the provided (or default) IANA zone, stored as UTC `scheduled_at`, timezone retained for display. Never silently treat local time as UTC.

### 17.8 Scheduled Task workflows

**Publish at task execution time:**

```
Generate image + caption → upload_media → create_post → publish_post
```

**Create now, publish later (preferred when time matters):**

```
Generate image + caption → upload_media → create_post → schedule_post
        → Routism cron → publishPost() → Instagram
```

ChatGPT does **not** need to stay online until publish time when using `schedule_post`.

**Example user prompts:**

```
Every day, create one Instagram post about AI productivity.
Generate a clean square JPEG image and an engaging caption.
Use my connected Instagram account via Routism Social.
Upload the image, create a draft, and publish it.
```

```
Every morning, create tomorrow's Instagram post about Routism tips.
Generate the image and caption, upload to Routism Social,
and schedule it for 7:00 PM in my Routism account timezone.
```

### 17.9 ChatGPT setup (Custom GPT Actions)

1. Deploy API with HTTPS; set `API_BASE_URL` correctly (not localhost).
2. Run migrations (`003_chatgpt_integration.sql`).
3. Set `CHATGPT_ACTIONS_CLIENT_ID` / `CHATGPT_ACTIONS_CLIENT_SECRET` on Render.
4. In ChatGPT → create a Custom GPT → **Actions** → Import from URL:
   `{API_BASE_URL}/integrations/chatgpt/openapi.json`
5. Authentication: OAuth  
   - Auth URL: `{API_BASE_URL}/integrations/chatgpt/oauth/authorize`  
   - Token URL: `{API_BASE_URL}/integrations/chatgpt/oauth/token`  
   - Client ID / Secret: same as env  
   - Scope: `chatgpt:actions`
6. Connect account when prompted (Routism login).
7. Ensure Instagram is already connected in the Routism dashboard for that user.
8. Create a Scheduled Task that instructs the GPT to use Routism actions.

### 17.10 Distinguish the three paths

| Path | Entry | Auth | Writes via |
|------|-------|------|------------|
| Dashboard | `/api/*` cookies | Session cookie | Controllers → services → `publishPost` |
| MCP | `/mcp` | OAuth Bearer `mcp:tools` | MCP tools → shared actions → `publishPost` |
| ChatGPT Actions | `/integrations/chatgpt/v1` | OAuth Bearer `chatgpt:actions` | REST → shared actions → `publishPost` |
| Scheduler | cron | Internal | `claimDueScheduledPost` → `publishPost` |

### 17.11 Troubleshooting

| Issue | Fix |
|-------|-----|
| `CHATGPT_NOT_CONFIGURED` | Set client id/secret on API |
| `redirect_uri is not allowed` | Add ChatGPT callback prefix to `CHATGPT_ACTIONS_REDIRECT_URIS` |
| `AUTH_REQUIRED` | Reconnect OAuth in the GPT |
| `CHATGPT_CONNECTION_REVOKED` | Re-authorize; check `rs_chatgpt_connections` |
| `INSTAGRAM_NOT_CONNECTED` | Connect Instagram in Routism dashboard first |
| Free ChatGPT / no Actions | Use dashboard; upgrade plan; or use MCP on supported plans |
| Duplicate posts | Send `Idempotency-Key`; rely on publish delivery guards |

---

## Appendix A — Shared types (`@routism/shared`)

Key exports: `UserPublic`, `AccountPublic`, `MediaPublic`, `PostPublic`, `DeliveryPublic`, `DashboardData`, `SettingsPublic`, `PostStatus`, `DeliveryStatus`, `AccountStatus`, `Platform`, `ApiSuccess`, `ApiErrorBody`.

Platform enum includes future values (`facebook`, `linkedin`, `x`, `threads`); **v1 implements Instagram only**.

---

## Appendix B — Instagram OAuth scopes (server)

Requested scopes include:

- `instagram_basic`
- `instagram_content_publish`
- `pages_show_list`
- `pages_read_engagement`
- `business_management`

Meta App Review may be required for production use beyond development/test roles.

---

## Appendix C — Privacy

Public page: `/privacy-policy`  
Configure contact with `VITE_PRIVACY_CONTACT_EMAIL`.  
Operator legal name/address must be supplied before treating the policy as final for Meta App Review.

---

*Generated for the Routism Social monorepo. Keep this file updated when endpoints, tools, or deploy topology change.*
