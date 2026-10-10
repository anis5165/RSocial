import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getSettings, patchSettings } from '../services/settings/settingsService';
import { ok } from '../utils/response';
import { AppError } from '../utils/errors';

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  timezone: z.string().min(1).max(64).optional(),
});

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await getSettings(req.user!.id);
    return ok(res, { settings });
  } catch (err) {
    return next(err);
  }
}

export async function patch(req: Request, res: Response, next: NextFunction) {
  try {
    const body = patchSchema.parse(req.body);
    const settings = await patchSettings(req.user!.id, body);
    return ok(res, { settings });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(new AppError('VALIDATION_ERROR', err.errors[0]?.message || 'Invalid input.', 400));
    }
    return next(err);
  }
}
