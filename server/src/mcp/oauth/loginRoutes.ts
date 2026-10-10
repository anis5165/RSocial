import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { loginUser } from '../../services/auth/authService';
import { deletePendingAuth, getPendingAuth, issueAuthCode } from './store';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';

const router = Router();

function loginPageHtml(pending: string, error?: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize Routism Social MCP</title>
  <style>
    body { font-family: system-ui, sans-serif; background:#080808; color:#F5F5F5; display:flex; min-height:100vh; align-items:center; justify-content:center; margin:0; }
    form { width:100%; max-width:400px; background:#141414; border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:28px; }
    h1 { font-size:1.25rem; margin:0 0 8px; }
    p { color:#B6B6B6; font-size:.9rem; margin:0 0 20px; }
    label { display:block; font-size:.85rem; color:#B6B6B6; margin:12px 0 4px; }
    input { width:100%; box-sizing:border-box; padding:10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,.12); background:#0E0E0E; color:#F5F5F5; }
    button { margin-top:18px; width:100%; padding:12px; border:0; border-radius:8px; background:#E6FF3F; color:#000; font-weight:600; cursor:pointer; }
    .err { background:rgba(239,68,68,.15); border:1px solid rgba(239,68,68,.35); color:#fecaca; padding:10px; border-radius:8px; font-size:.85rem; margin-bottom:12px; }
  </style>
</head>
<body>
  <form method="POST" action="/mcp/oauth/login">
    <h1>Routism Social</h1>
    <p>Sign in to allow ChatGPT (or another MCP client) to manage your Instagram publishing on your behalf.</p>
    ${error ? `<div class="err">${error}</div>` : ''}
    <input type="hidden" name="pending" value="${pending}" />
    <label>Email</label>
    <input type="email" name="email" required autocomplete="username" />
    <label>Password</label>
    <input type="password" name="password" required minlength="8" autocomplete="current-password" />
    <button type="submit">Authorize access</button>
  </form>
</body>
</html>`;
}

router.get('/login', async (req: Request, res: Response) => {
  const pending = String(req.query.pending || '');
  if (!pending) {
    res.status(400).send('Missing pending authorization id.');
    return;
  }
  const row = await getPendingAuth(pending);
  if (!row) {
    res.status(400).send('Authorization request expired or invalid. Restart the ChatGPT connection.');
    return;
  }
  res.type('html').send(loginPageHtml(pending));
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
      res.status(400).type('html').send(loginPageHtml(body.pending, 'Authorization expired. Try connecting again.'));
      return;
    }

    const user = await loginUser(body.email, body.password);
    const code = await issueAuthCode({
      userId: user.id,
      clientId: String(pending.client_id),
      redirectUri: String(pending.redirect_uri),
      codeChallenge: String(pending.code_challenge),
      scopes: pending.scopes ? String(pending.scopes) : 'mcp:tools',
      resource: pending.resource ? String(pending.resource) : undefined,
    });

    await deletePendingAuth(body.pending);

    const redirect = new URL(String(pending.redirect_uri));
    redirect.searchParams.set('code', code);
    if (pending.state) redirect.searchParams.set('state', String(pending.state));

    logger.info('mcp_oauth_authorized', {
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
    res.status(401).type('html').send(loginPageHtml(pending, message));
  }
});

export default router;
