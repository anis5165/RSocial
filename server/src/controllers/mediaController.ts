import { Request, Response, NextFunction } from 'express';
import {
  deleteUserMedia,
  getMediaById,
  listMedia,
  uploadImage,
  uploadImageUsingChatGPT,
} from '../services/media/mediaService';
import { ok } from '../utils/response';
import { AppError } from '../utils/errors';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const media = await listMedia(req.user!.id, { search });
    return ok(res, { media });
  } catch (err) {
    return next(err);
  }
}

export async function upload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new AppError('FILE_REQUIRED', 'Image file is required.', 400);
    }
    const media = await uploadImage(req.user!.id, req.file);
    return ok(res, { media }, 201);
  } catch (err) {
    return next(err);
  }
}

export async function uploadChatGPT(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new AppError('FILE_REQUIRED', 'Image file is required.', 400);
    }
    const media = await uploadImageUsingChatGPT(req.file);
    return ok(res, { media }, 201);
  } catch (err) {
    return next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const media = await getMediaById(req.params.id, req.user!.id);
    return ok(res, { media });
  } catch (err) {
    return next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteUserMedia(req.params.id, req.user!.id);
    return ok(res, { deleted: true });
  } catch (err) {
    return next(err);
  }
}
