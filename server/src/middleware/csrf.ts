import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

function isMcpOrOAuthPath(path: string): boolean {
  return (
    path === '/mcp' ||
    path.startsWith('/mcp/') ||
    path === '/authorize' ||
    path === '/token' ||
    path === '/register' ||
    path === '/revoke' ||
    path.startsWith('/.well-known/') ||
    path.startsWith('/api/accounts/instagram/callback') ||
    path.startsWith('/integrations/chatgpt/') ||
    path === '/api/media/chatgpt'
  );
}

/**
 * Origin/Referer check for cookie-authenticated mutating requests.
 * MCP Bearer-auth routes and OAuth endpoints are exempt.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (SAFE.has(req.method)) return next();
  if (isMcpOrOAuthPath(req.path)) return next();

  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const allowed = env.CORS_ORIGIN.split(',').map((s) => s.trim());

  if (origin) {
    if (!allowed.includes(origin)) {
      return next(new AppError('CSRF_REJECTED', 'Invalid request origin.', 403));
    }
    return next();
  }

  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (!allowed.includes(refOrigin)) {
        return next(new AppError('CSRF_REJECTED', 'Invalid request referer.', 403));
      }
      return next();
    } catch {
      return next(new AppError('CSRF_REJECTED', 'Invalid request referer.', 403));
    }
  }

  if (env.NODE_ENV !== 'production') return next();

  return next(new AppError('CSRF_REJECTED', 'Missing request origin.', 403));
}
