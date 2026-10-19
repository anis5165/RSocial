import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../../../utils/errors';
import { ok } from '../../../utils/response';
import {
  actionCancelScheduledPost,
  actionCreatePost,
  actionGetPostStatus,
  actionListConnectedAccounts,
  actionListScheduledPosts,
  actionPublishPost,
  actionRetryPost,
  actionSchedulePost,
  actionUploadMedia,
} from '../../shared/publishingActions';

function idempotencyKey(req: Request): string | undefined {
  const h = req.headers['idempotency-key'];
  if (typeof h === 'string' && h.trim()) return h.trim();
  if (typeof req.body?.idempotencyKey === 'string') return req.body.idempotencyKey;
  return undefined;
}

export async function listAccounts(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await actionListConnectedAccounts(req.user!.id);
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
}

export async function uploadMedia(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z
      .object({
        imageBase64: z.string().min(1),
        mimeType: z.string().optional(),
        filename: z.string().optional(),
        idempotencyKey: z.string().optional(),
      })
      .parse(req.body);
    const data = await actionUploadMedia(req.user!.id, {
      ...body,
      idempotencyKey: idempotencyKey(req) || body.idempotencyKey,
    });
    return ok(res, data, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(new AppError('VALIDATION_ERROR', err.errors[0]?.message || 'Invalid input.', 400));
    }
    return next(err);
  }
}

export async function createPost(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z
      .object({
        caption: z.string().min(1).max(2200),
        mediaId: z.string().uuid(),
        accountId: z.string().uuid().optional(),
        idempotencyKey: z.string().optional(),
      })
      .parse(req.body);
    const data = await actionCreatePost(req.user!.id, {
      ...body,
      idempotencyKey: idempotencyKey(req) || body.idempotencyKey,
    });
    return ok(res, data, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(new AppError('VALIDATION_ERROR', err.errors[0]?.message || 'Invalid input.', 400));
    }
    return next(err);
  }
}

export async function schedulePostAction(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z
      .object({
        postId: z.string().uuid(),
        scheduledAt: z.string().min(1),
        timezone: z.string().optional(),
        idempotencyKey: z.string().optional(),
      })
      .parse(req.body);
    const data = await actionSchedulePost(req.user!.id, {
      ...body,
      timezone: body.timezone || req.user!.timezone,
      idempotencyKey: idempotencyKey(req) || body.idempotencyKey,
    });
    return ok(res, data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(new AppError('VALIDATION_ERROR', err.errors[0]?.message || 'Invalid input.', 400));
    }
    return next(err);
  }
}

export async function publishPostAction(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z
      .object({
        postId: z.string().uuid(),
        idempotencyKey: z.string().optional(),
      })
      .parse(req.body);
    const data = await actionPublishPost(req.user!.id, {
      postId: body.postId,
      idempotencyKey: idempotencyKey(req) || body.idempotencyKey,
    });
    return ok(res, data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(new AppError('VALIDATION_ERROR', err.errors[0]?.message || 'Invalid input.', 400));
    }
    return next(err);
  }
}

export async function cancelScheduled(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z.object({ postId: z.string().uuid() }).parse(req.body);
    const data = await actionCancelScheduledPost(req.user!.id, body.postId);
    return ok(res, data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(new AppError('VALIDATION_ERROR', err.errors[0]?.message || 'Invalid input.', 400));
    }
    return next(err);
  }
}

export async function getStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const postId = String(req.query.postId || req.params.postId || '');
    if (!z.string().uuid().safeParse(postId).success) {
      throw new AppError('VALIDATION_ERROR', 'postId must be a UUID.', 400);
    }
    const data = await actionGetPostStatus(req.user!.id, postId);
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
}

export async function listScheduled(req: Request, res: Response, next: NextFunction) {
  try {
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        accountId: z.string().uuid().optional(),
      })
      .parse(req.query);
    const data = await actionListScheduledPosts(req.user!.id, q);
    return ok(res, data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(new AppError('VALIDATION_ERROR', err.errors[0]?.message || 'Invalid input.', 400));
    }
    return next(err);
  }
}

export async function retryPostAction(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z
      .object({
        postId: z.string().uuid(),
        idempotencyKey: z.string().optional(),
      })
      .parse(req.body);
    const data = await actionRetryPost(req.user!.id, {
      postId: body.postId,
      idempotencyKey: idempotencyKey(req) || body.idempotencyKey,
    });
    return ok(res, data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(new AppError('VALIDATION_ERROR', err.errors[0]?.message || 'Invalid input.', 400));
    }
    return next(err);
  }
}
