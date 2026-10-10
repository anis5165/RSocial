import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { loginUser, registerUser } from '../services/auth/authService';
import {
  clearSessionCookie,
  setSessionCookie,
  getSessionUser,
} from '../services/auth/session';
import { ok } from '../utils/response';
import { AppError } from '../utils/errors';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
  timezone: z.string().optional(),
});

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const body = loginSchema.parse(req.body);
    const user = await loginUser(body.email, body.password);
    setSessionCookie(res, user.id);
    return ok(res, { user });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(new AppError('VALIDATION_ERROR', err.errors[0]?.message || 'Invalid input.', 400));
    }
    return next(err);
  }
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const body = registerSchema.parse(req.body);
    const user = await registerUser(body);
    setSessionCookie(res, user.id);
    return ok(res, { user }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(new AppError('VALIDATION_ERROR', err.errors[0]?.message || 'Invalid input.', 400));
    }
    return next(err);
  }
}

export async function logout(_req: Request, res: Response, next: NextFunction) {
  try {
    clearSessionCookie(res);
    return ok(res, { loggedOut: true });
  } catch (err) {
    return next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user || (await getSessionUser(req));
    if (!user) throw new AppError('UNAUTHORIZED', 'Authentication required.', 401);
    return ok(res, { user });
  } catch (err) {
    return next(err);
  }
}
