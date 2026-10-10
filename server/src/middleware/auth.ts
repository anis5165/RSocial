import { Request, Response, NextFunction } from 'express';
import { getSessionUser } from '../services/auth/session';
import { AppError } from '../utils/errors';

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required.', 401);
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    req.user = (await getSessionUser(req)) ?? undefined;
    next();
  } catch {
    next();
  }
}
