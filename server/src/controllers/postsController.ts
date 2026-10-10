import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  cancelPost,
  createPost,
  getPostById,
  listPosts,
  schedulePost,
  updatePost,
} from '../services/posts/postsService';
import { publishPost, retryPost } from '../services/posts/publishService';
import { ok } from '../utils/response';
import { AppError } from '../utils/errors';
import type { PostStatus } from '@routism/shared';

const createSchema = z.object({
  caption: z.string().min(1).max(2200),
  mediaId: z.string().uuid(),
});

const updateSchema = z.object({
  caption: z.string().min(1).max(2200).optional(),
  mediaId: z.string().uuid().optional(),
});

const scheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  timezone: z.string().min(1),
});

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const status = (req.query.status as PostStatus | 'all' | undefined) || 'all';
    const posts = await listPosts(req.user!.id, { status });
    return ok(res, { posts });
  } catch (err) {
    return next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createSchema.parse(req.body);
    const post = await createPost(req.user!.id, body);
    return ok(res, { post }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(new AppError('VALIDATION_ERROR', err.errors[0]?.message || 'Invalid input.', 400));
    }
    return next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const post = await getPostById(req.params.id, req.user!.id);
    return ok(res, { post });
  } catch (err) {
    return next(err);
  }
}

export async function patch(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateSchema.parse(req.body);
    const post = await updatePost(req.params.id, req.user!.id, body);
    return ok(res, { post });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(new AppError('VALIDATION_ERROR', err.errors[0]?.message || 'Invalid input.', 400));
    }
    return next(err);
  }
}

export async function publish(req: Request, res: Response, next: NextFunction) {
  try {
    const post = await publishPost(req.params.id, req.user!.id);
    return ok(res, { post });
  } catch (err) {
    return next(err);
  }
}

export async function schedule(req: Request, res: Response, next: NextFunction) {
  try {
    const body = scheduleSchema.parse(req.body);
    const time = body.time.length === 5 ? `${body.time}:00` : body.time;
    const post = await schedulePost(req.user!.id, {
      postId: req.params.id,
      date: body.date,
      time,
      timezone: body.timezone,
    });
    return ok(res, { post });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(new AppError('VALIDATION_ERROR', err.errors[0]?.message || 'Invalid input.', 400));
    }
    return next(err);
  }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const post = await cancelPost(req.params.id, req.user!.id);
    return ok(res, { post });
  } catch (err) {
    return next(err);
  }
}

export async function retry(req: Request, res: Response, next: NextFunction) {
  try {
    const post = await retryPost(req.params.id, req.user!.id);
    return ok(res, { post });
  } catch (err) {
    return next(err);
  }
}
