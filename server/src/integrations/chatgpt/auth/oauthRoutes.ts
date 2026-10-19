import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { env } from '../../../config/env';
import { loginUser } from '../../../services/auth/authService';
import { AppError } from '../../../utils/errors';
import { logger } from '../../../utils/logger';
import {
  createPendingAuth,
  deletePendingAuth,
  getPendingAuth,
  issueAuthCode,
  consumeAuthCode,
  getAuthCode,
  randomOpaqueToken,
  storeTokenPair,
  findRefreshToken,
  revokeToken,
} from '../../../mcp/oauth/store';
import { upsertChatgptConnection } from './connectionService';

const router = Router();
const ACCESS_TTL = 3600;
const REFRESH_TTL = 60 * 60 * 24 * 30;
const SCOPE = 'chatgpt:actions';

function configuredClient() {
  const clientId = (process.env.CHATGPT_ACTIONS_CLIENT_ID || '').trim();
  const clientSecret = (process.env.CHATGPT_ACTIONS_CLIENT_SECRET || '').trim();
  const redirects = (process.env.CHATGPT_ACTIONS_REDIRECT_URIS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // OpenAI Custom GPT / ChatGPT Actions common callback hosts
  const defaults = [
    'https://chat.openai.com/aip',
    'https://chatgpt.com/aip',
  ];
  return { clientId, clientSecret, redirects: redirects.length ? redirects : defaults };
}

function redirectAllowed(uri: string): boolean {
  const { redirects } = configuredClient();
  try {
    const u = new URL(uri);
    return redirects.some((allowed) => {
      if (allowed.startsWith('https://') && !allowed.includes('://', 8)) {
        // prefix match for https://chat.openai.com/aip
        return uri.startsWith(allowed);
      }
      return uri === allowed || u.origin === allowed;
    });
  } catch {
    return false;
  }
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function loginHtml(pending: string, error?: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize Routism Social</title>
  <style>
    body { font-family: system-ui, sans-serif; background:#080808; color:#F5F5F5; display:flex; min-height:100vh; align-items:center; justify-content:center; margin:0; }
    form { width:100%; max-width:420px; background:#141414; border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:28px; }
    h1 { font-size:1.25rem; margin:0 0 8px; }
    p { color:#B6B6B6; font-size:.9rem; margin:0 0 20px; }
    label { display:block; font-size:.85rem; color:#B6B6B6; margin:12px 0 4px; }
    input { width:100%; box-sizing:border-box; padding:10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,.12); background:#0E0E0E; color:#F5F5F5; }
    button { margin-top:18px; width:100%; padding:12px; border:0; border-radius:8px; background:#E6FF3F; color:#000; font-weight:600; cursor:pointer; }
    .err { background:rgba(239,68,68,.15); border:1px solid rgba(239,68,68,.35); color:#fecaca; padding:10px; border-radius:8px; font-size:.85rem; margin-bottom:12px; }
  </style>
</head>
<body>
  <form method="POST" action="/integrations/chatgpt/oauth/login">
    <h1>Connect Routism Social</h1>
    <p>Sign in to allow ChatGPT to create, schedule, and publish Instagram posts through Routism on your behalf. Instagram credentials never leave Routism.</p>
    ${error ? `<div class="err">${error}</div>` : ''}
    <input type="hidden" name="pending" value="${pending}" />
    <label>Email</label>
    <input type="email" name="email" required autocomplete="username" />
    <label>Password</label>
    <input type="password" name="password" required minlength="8" autocomplete="current-password" />
    <button type="submit">Authorize ChatGPT</button>
  </form>
</body>
</html>`;
}

/** ChatGPT Actions Authorization URL */
router.get('/authorize', async (req: Request, res: Response) => {
  try {
    const { clientId } = configuredClient();
    if (!clientId) {
      throw new AppError(
        'CHATGPT_NOT_CONFIGURED',
        'Set CHATGPT_ACTIONS_CLIENT_ID and CHATGPT_ACTIONS_CLIENT_SECRET on the API.',
        503
      );
    }

    const q = z
      .object({
        client_id: z.string().min(1),
        redirect_uri: z.string().url(),
        response_type: z.string().default('code'),
        state: z.string().optional(),
        scope: z.string().optional(),
      })
      .parse(req.query);

    if (q.client_id !== clientId) {
      throw new AppError('AUTH_REQUIRED', 'Unknown client_id.', 401);
    }
    if (q.response_type !== 'code') {
      throw new AppError('VALIDATION_ERROR', 'response_type must be code.', 400);
    }
    if (!redirectAllowed(q.redirect_uri)) {
      throw new AppError('VALIDATION_ERROR', 'redirect_uri is not allowed.', 400);
    }

    // ChatGPT Actions may not send PKCE — store a placeholder challenge
    const pendingId = await createPendingAuth({
      clientId: q.client_id,
      redirectUri: q.redirect_uri,
      codeChallenge: 'chatgpt-actions-no-pkce',
      state: q.state,
      scopes: [SCOPE],
      resource: new URL('/integrations/chatgpt/v1', env.API_BASE_URL).toString(),
    });

    res.redirect(`/integrations/chatgpt/oauth/login?pending=${encodeURIComponent(pendingId)}`);
  } catch (err) {
    const message = err instanceof AppError ? err.message : 'Authorization failed.';
    res.status(err instanceof AppError ? err.statusCode : 400).type('html').send(`<p>${message}</p>`);
  }
});

router.get('/login', async (req: Request, res: Response) => {
  const pending = String(req.query.pending || '');
  if (!pending) {
    res.status(400).send('Missing pending authorization id.');
    return;
  }
  const row = await getPendingAuth(pending);
  if (!row) {
    res.status(400).send('Authorization expired. Restart the ChatGPT connection.');
    return;
  }
  res.type('html').send(loginHtml(pending));
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const body = z
      .object({
        pending: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
      })
      .parse(req.body);

    const pending = await getPendingAuth(body.pending);
    if (!pending) {
      res.status(400).type('html').send(loginHtml(body.pending, 'Authorization expired. Try again.'));
      return;
    }

    const user = await loginUser(body.email, body.password);
    const code = await issueAuthCode({
      userId: user.id,
      clientId: String(pending.client_id),
      redirectUri: String(pending.redirect_uri),
      codeChallenge: String(pending.code_challenge),
      scopes: SCOPE,
      resource: pending.resource ? String(pending.resource) : undefined,
    });

    await upsertChatgptConnection({
      userId: user.id,
      clientId: String(pending.client_id),
      scopes: SCOPE,
    });

    await deletePendingAuth(body.pending);

    const redirect = new URL(String(pending.redirect_uri));
    redirect.searchParams.set('code', code);
    if (pending.state) redirect.searchParams.set('state', String(pending.state));

    logger.info('chatgpt_oauth_authorized', {
      userId: user.id,
      clientId: pending.client_id,
    });

    res.redirect(redirect.toString());
  } catch (err) {
    const pending = String(req.body?.pending || '');
    const message =
      err instanceof AppError
        ? err.message
        : err instanceof z.ZodError
          ? 'Invalid login form.'
          : 'Login failed.';
    res.status(401).type('html').send(loginHtml(pending, message));
  }
});

/** Token endpoint for ChatGPT Actions (client_secret_post, optional refresh) */
router.post('/token', async (req: Request, res: Response) => {
  try {
    const { clientId, clientSecret } = configuredClient();
    if (!clientId || !clientSecret) {
      throw new AppError('CHATGPT_NOT_CONFIGURED', 'ChatGPT Actions OAuth is not configured.', 503);
    }

    const body = z
      .object({
        grant_type: z.enum(['authorization_code', 'refresh_token']),
        code: z.string().optional(),
        redirect_uri: z.string().optional(),
        refresh_token: z.string().optional(),
        client_id: z.string().optional(),
        client_secret: z.string().optional(),
      })
      .parse(req.body);

    const cid = body.client_id || '';
    const csec = body.client_secret || '';
    if (cid !== clientId || !timingSafeEqualStr(csec, clientSecret)) {
      throw new AppError('AUTH_REQUIRED', 'Invalid client credentials.', 401);
    }

    if (body.grant_type === 'authorization_code') {
      if (!body.code || !body.redirect_uri) {
        throw new AppError('VALIDATION_ERROR', 'code and redirect_uri are required.', 400);
      }
      const row = await getAuthCode(body.code);
      if (!row) throw new AppError('AUTH_REQUIRED', 'Invalid authorization code.', 401);
      if (String(row.client_id) !== clientId) {
        throw new AppError('AUTH_REQUIRED', 'Code was not issued to this client.', 401);
      }
      if (String(row.redirect_uri) !== body.redirect_uri) {
        throw new AppError('AUTH_REQUIRED', 'redirect_uri mismatch.', 401);
      }

      await consumeAuthCode(body.code);

      const accessToken = randomOpaqueToken(32);
      const refreshToken = randomOpaqueToken(32);
      await storeTokenPair({
        accessToken,
        refreshToken,
        clientId,
        userId: String(row.user_id),
        scopes: SCOPE,
        resource: row.resource ? String(row.resource) : undefined,
        accessTtlSec: ACCESS_TTL,
        refreshTtlSec: REFRESH_TTL,
      });

      await upsertChatgptConnection({
        userId: String(row.user_id),
        clientId,
        scopes: SCOPE,
      });

      res.json({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: ACCESS_TTL,
        refresh_token: refreshToken,
        scope: SCOPE,
      });
      return;
    }

    // refresh_token
    if (!body.refresh_token) {
      throw new AppError('VALIDATION_ERROR', 'refresh_token is required.', 400);
    }
    const row = await findRefreshToken(body.refresh_token);
    if (!row || String(row.client_id) !== clientId) {
      throw new AppError('AUTH_REQUIRED', 'Invalid refresh token.', 401);
    }

    await revokeToken(body.refresh_token);
    const accessToken = randomOpaqueToken(32);
    const refreshToken = randomOpaqueToken(32);
    await storeTokenPair({
      accessToken,
      refreshToken,
      clientId,
      userId: String(row.user_id),
      scopes: SCOPE,
      resource: row.resource ? String(row.resource) : undefined,
      accessTtlSec: ACCESS_TTL,
      refreshTtlSec: REFRESH_TTL,
    });

    await upsertChatgptConnection({
      userId: String(row.user_id),
      clientId,
      scopes: SCOPE,
    });

    res.json({
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: ACCESS_TTL,
      refresh_token: refreshToken,
      scope: SCOPE,
    });
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 400;
    const code = err instanceof AppError ? err.code : 'VALIDATION_ERROR';
    const message = err instanceof Error ? err.message : 'Token error';
    res.status(status).json({
      error: code === 'AUTH_REQUIRED' ? 'invalid_client' : 'invalid_request',
      error_description: message,
    });
  }
});

export default router;
