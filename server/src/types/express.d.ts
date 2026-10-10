import type { AuthUser } from '../services/auth/session';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
      csrfToken?: () => string;
    }
  }
}

export {};
