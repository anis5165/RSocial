# Routism Social

Production-oriented social media publishing and scheduling platform for the Routism brand.

**v1 scope:** Instagram single-image publishing only.  
Architecture is ready for Facebook, LinkedIn, X, Threads, Reels, carousels, analytics, approvals, billing, and MCP — without rewriting the core publish path.

## Architecture

```
React Dashboard (Vite)
        | HTTPS REST API (cookie session)
        v
Node.js + Express (TypeScript)
        +-- /api/*  website REST
        +-- /mcp    Streamable HTTP MCP (ChatGPT)
        +-- OAuth 2.1 AS (/authorize, /token, /register)
        +-- MySQL / MariaDB
        +-- Cloudinary
        +-- Instagram Graph API
        +-- node-cron scheduler
```

Central publishing function (website + scheduler + MCP all call the same):

```ts
publishPost(postId, userId)
```

MCP tools are thin wrappers around:

- `listConnectedAccounts(userId)`
- `uploadImage(userId, file)`
- `createPost(userId, data)`
- `schedulePost(userId, data)`
- `publishPost(postId, userId)`
- `getPostStatus` → `getPostById(postId, userId)`
- `cancelPost(postId, userId)`

## Requirements

- Node.js 20+
- MySQL 8+ or MariaDB 10.5+
- Cloudinary account
- Meta Developer app with Instagram Graph / Facebook Login permissions for professional Instagram accounts

## Project structure

```
routism-social/
  apps/dashboard/     React + Vite dashboard
  server/             Express API + scheduler
  shared/             Shared TypeScript types
  database/migrations SQL migrations
  .env.example
  README.md
```

## Installation

```bash
# from repo root
npm install
cp .env.example .env
# edit .env with real values
```

Generate a 32-byte encryption key (hex):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put the result in `ENCRYPTION_KEY`. Also set long random values for `JWT_SECRET` and `SESSION_SECRET`.

## MySQL setup

1. Create a database user (or use an existing one) that can create tables in your target database.
2. Fill `DATABASE_*` in `.env`.
3. Run migrations:

```bash
npm run migrate
```

Migrations live in `database/migrations/` and are tracked in `schema_migrations`. phpMyAdmin is only for inspection — the app connects with `mysql2` directly.

Tables are prefixed with `rs_` (`rs_users`, `rs_posts`, …) so they do not collide with other apps sharing the same Hostinger database (a common cause of errno 150 foreign-key errors).

## Cloudinary setup

This app uses **unsigned uploads** (no API key / API secret).

1. In Cloudinary Settings → Upload → Upload presets, create/enable an **unsigned** preset (e.g. `cooking`).
2. Set in `.env`:
   - `CLOUDINARY_CLOUD_NAME=dyb3jipsi`
   - `CLOUDINARY_UPLOAD_PRESET=cooking`
3. Uploads go: Browser → API (`multipart`) → Cloudinary unsigned upload API → MySQL metadata.
4. Upload endpoint: `https://api.cloudinary.com/v1_1/{cloud_name}/image/upload`
5. Delivery URL shape: `https://res.cloudinary.com/{cloud_name}/image/upload/{public_id}.jpg`
6. Preferred public_id pattern: `routism-social/{userId}/media/{mediaId}` (requires the preset to allow public_id override; otherwise Cloudinary assigns one).

## Instagram / Meta setup

1. Create a Meta app and add **Instagram** / **Facebook Login** products as required by Meta’s current docs.
2. Use a professional Instagram account linked to a Facebook Page.
3. Configure OAuth redirect URI exactly:

   `http://localhost:4000/api/accounts/instagram/callback`

   (production: `https://YOUR_API_HOST/api/accounts/instagram/callback`)

4. Request / enable permissions needed for content publishing (commonly includes Instagram content publish + pages access). App review may be required for production.
5. Set in `.env`:

   - `INSTAGRAM_CLIENT_ID` (App ID)
   - `INSTAGRAM_CLIENT_SECRET` (App Secret)
   - `INSTAGRAM_REDIRECT_URI`

Tokens are encrypted with AES-256-GCM before storage. They are never returned to the React app or written to logs.

## Environment variables

See `.env.example`. Important rules:

- Private secrets exist **only** on the backend.
- Never create `VITE_INSTAGRAM_CLIENT_SECRET`, `VITE_CLOUDINARY_API_SECRET`, or `VITE_DATABASE_PASSWORD`.
- Optional frontend: `VITE_API_BASE_URL` (leave empty in dev to use Vite proxy to `:4000`).

## Database migration

```bash
npm run migrate
```

Creates the database if missing, applies pending SQL files, records them in `schema_migrations`.

## Development

```bash
# both API + dashboard
npm run dev

# independently
npm run dev:server
npm run dev:dashboard
```

- Dashboard: http://localhost:5173  
- API: http://localhost:4000  
- Health: `GET /api/health`

Register a user at `/register`, then use the dashboard.

### Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | API + dashboard |
| `npm run build` | Build shared, server, dashboard |
| `npm run start` | Start compiled API |
| `npm run migrate` | Apply SQL migrations |
| `npm run lint` | Typecheck |
| `npm run test` | Server unit tests |

## Authentication & security

- HTTP-only session cookie (`routism_session`), not `localStorage`
- Server derives `req.user.id` from the session — never trust client `userId`
- Ownership checks: `WHERE id = ? AND user_id = ?` on media, posts, accounts, deliveries, OAuth state
- Helmet, CORS with credentials, CSRF Origin/Referer checks, rate limits on login/OAuth/upload/publish/retry
- Parameterized SQL only

## Publishing & duplicate protection

Flow:

1. Atomic claim → `publishing` + lock token  
2. Check existing successful delivery / idempotency key  
3. Create Instagram media container → wait → publish  
4. Save delivery + remote post id → `published`  
5. On failure → `failed` with safe error message  

Scheduler (`node-cron`, every minute) uses `SELECT … FOR UPDATE` then the same publish core — no separate Instagram implementation.

## Scheduling & timezones

- Store `scheduled_at` in UTC
- Store user-selected `timezone` separately
- Default timezone: `Asia/Kolkata`
- Convert local → UTC on schedule; display in user timezone in the UI

## Production deployment

### Dashboard on Vercel

Root `vercel.json` builds and serves the Vite SPA from `apps/dashboard/dist`.

1. Import the repo in Vercel (Root Directory = repo root).
2. Set environment variable:
   - `VITE_API_BASE_URL=https://api.yourdomain.com` (your Express API origin, no trailing slash)
3. Deploy. SPA rewrites send non-asset routes to `index.html`.

The Express API (scheduler, MCP, Instagram, MySQL) should **not** run as a Vercel serverless function — it needs a long-lived Node process (Railway, Render, Fly.io, VPS, etc.).

### API host

1. Build: `npm run build`
2. Set `NODE_ENV=production`, `COOKIE_SECURE=true`, HTTPS URLs for `APP_BASE_URL` / `API_BASE_URL` / OAuth redirect
3. `APP_BASE_URL` = your Vercel dashboard URL (e.g. `https://social.vercel.app`)
4. `API_BASE_URL` = your API host
5. `CORS_ORIGIN` = dashboard origin(s)
6. Run API: `npm run start` under a process manager so the scheduler keeps ticking
7. Use SameSite=None + Secure cookies when dashboard and API are on different sites

### HTTPS & OAuth

Meta requires HTTPS redirect URIs in production. Point DNS + TLS at your API host and update `INSTAGRAM_REDIRECT_URI`.

## Scheduler

Starts automatically with the API process. No separate worker is required for v1. Logs events as `scheduler_*` / `publish_*` (never tokens).

## MCP (ChatGPT remote control)

### Architecture

```
ChatGPT
   | MCP Streamable HTTP + OAuth 2.1
   v
https://api.yourdomain.com/mcp
   |
   +-- Bearer access token → userId (never from tool args)
   +-- existing services → MySQL / Cloudinary / Instagram
```

Tools:

| Tool | Purpose |
|------|---------|
| `list_connected_accounts` | Safe account list (no tokens) |
| `upload_image` | JPEG base64 → Cloudinary → mediaId |
| `create_post` | Draft from caption + mediaId |
| `schedule_post` | Future publish (local time + timezone → UTC) |
| `publish_post` | Immediate publish via `publishPost()` |
| `get_post_status` | Status / remote id for owned posts |
| `cancel_post` | Cancel `scheduled` → draft |

### Authorization flow

1. ChatGPT discovers AS metadata: `GET /.well-known/oauth-authorization-server`
2. Discovers protected resource: `GET /.well-known/oauth-protected-resource/mcp`
3. Dynamic client registration: `POST /register` (optional)
4. Authorization: `GET /authorize` → redirect to `/mcp/oauth/login`
5. User signs in with Routism email/password and authorizes the client
6. Auth code returned to ChatGPT redirect URI
7. `POST /token` exchanges code (+ PKCE) for short-lived access token + refresh token
8. ChatGPT calls `POST /mcp` with `Authorization: Bearer <access_token>`
9. Server resolves `userId` from the token; tools never accept a trusted `userId` argument

Tokens are stored hashed in MySQL (`rs_mcp_tokens`). Instagram tokens remain encrypted and never leave the backend.

### Local MCP development

```bash
npm run migrate
npm run dev:server

# Mint a personal access token for inspector / smoke tests
npm run mcp:token -- --email admin@routism.com --password RoutismAdmin123!

# Smoke test (server must be running)
set MCP_TOKEN=<accessToken>
npm run mcp:smoke
```

Or use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) against `http://localhost:4000/mcp` with the Bearer token.

### Production MCP endpoint

- URL: `https://api.yourdomain.com/mcp`
- Requires valid TLS (HTTPS)
- Set `API_BASE_URL=https://api.yourdomain.com`
- Set `APP_BASE_URL` to your dashboard origin
- Do **not** expose MySQL publicly
- Optional: `MCP_CORS_ORIGINS` for extra browser origins

For local tunnels (ngrok, Cloudflare Tunnel), point `API_BASE_URL` at the HTTPS tunnel URL. If the issuer is not localhost and not HTTPS, set `MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL=true` only for temporary testing.

### Connect ChatGPT

1. Deploy API with HTTPS and run migrations (`002_mcp_oauth.sql` included in `npm run migrate`)
2. Open ChatGPT → Settings → Apps / Connectors / Developer Mode (UI varies by plan)
3. Add custom MCP server URL: `https://api.yourdomain.com/mcp`
4. Choose OAuth authentication
5. Complete Routism login/consent when prompted
6. Confirm tools are imported
7. New chat → enable Routism Social → try:

   - “List my connected Instagram accounts.”
   - “Create a post using this image with caption: Ride smarter with Routism.”
   - “Schedule it for tomorrow at 8 PM India time.”
   - “What's the status of that post?”
   - “Publish this post now.” / “Cancel that scheduled post.”

### MCP security notes

- Never send Instagram tokens, DB passwords, encryption keys, or Cloudinary secrets to ChatGPT
- Tool results are safe metadata only
- Ownership checks are identical to the website (`user_id = authenticated user`)
- Duplicate publish protection is unchanged (shared `publishPost`)
- Multi-tenant: each OAuth session maps to one Routism user

### MCP troubleshooting

| Issue | Check |
|-------|--------|
| 401 on `/mcp` | Valid Bearer token; not expired; scope includes `mcp:tools` |
| OAuth login expired | Restart ChatGPT connect; pending auth TTL is 10 minutes |
| Issuer must be HTTPS | Use HTTPS `API_BASE_URL` in production |
| Tools missing | Confirm initialize succeeded; check server logs `mcp_session_initialized` |
| POST_NOT_FOUND | Post belongs to another user or wrong id |
| Cannot reach localhost | Use a public HTTPS tunnel for ChatGPT |

## Troubleshooting

| Issue | Check |
|-------|--------|
| DB connection failed | Host/port/user/password/firewall; run `npm run migrate` |
| Cloudinary upload fails | Cloud name/key/secret; JPEG only; size ≤ 8MB |
| Instagram connect fails | Redirect URI exact match; Page ↔ IG professional link; permissions |
| Publish fails | Account connected; token not expired; public Cloudinary HTTPS URL reachable by Meta |
| Scheduled posts stuck | API process running; `scheduled_at` in UTC; status = `scheduled` |
| CSRF rejected | Dashboard origin in `CORS_ORIGIN` |
| 401 loops | Cookie domain / Secure / SameSite; use Vite proxy in local dev |

## Acceptance checklist

1. Login works with session cookie  
2. Dashboard stats from MySQL  
3. JPEG upload → Cloudinary + media row  
4. Instagram OAuth connect + encrypted token stored  
5. Create draft → publish now → Instagram post + delivery row  
6. Schedule post → cron claims → publishes  
7. Failed status + safe retry (no duplicate when delivery already published)  
8. User A cannot read User B media/posts/accounts  
9. Secrets never in frontend bundle or API responses  
10. MCP `/mcp` reachable (HTTPS in production)  
11. ChatGPT (or inspector) authenticates and lists tools  
12. MCP list/upload/create/schedule/publish/status/cancel work via existing services  
13. MCP cannot access another user's posts  

## License

Proprietary — Routism.
