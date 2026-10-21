import { Request, Response, NextFunction } from 'express';
import {
  deleteUserMedia,
  getMediaById,
  listMedia,
  toUploadFile,
  uploadImage,
  uploadImageUsingChatGPT,
} from '../services/media/mediaService';
import { ok } from '../utils/response';
import { AppError } from '../utils/errors';

const MAX_BYTES = 8 * 1024 * 1024;

function firstUploadedFile(req: Request): Express.Multer.File | undefined {
  if (req.file) return req.file;
  const files = req.files;
  if (Array.isArray(files) && files[0]) return files[0];
  if (files && typeof files === 'object') {
    const first = Object.values(files).flat()[0];
    if (first) return first;
  }
  return undefined;
}

function bodyString(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function fileFromChatGptBody(req: Request): Promise<Express.Multer.File | undefined> {
  const imageBase64 = bodyString(req.body, 'imageBase64') || bodyString(req.body, 'image');
  if (imageBase64) {
    let b64 = imageBase64;
    let mime = (bodyString(req.body, 'mimeType') || 'image/jpeg').toLowerCase();
    if (b64.startsWith('data:')) {
      const match = /^data:([^;]+);base64,(.+)$/s.exec(b64);
      if (!match) throw new AppError('INVALID_MEDIA', 'Invalid data URL.', 400);
      mime = match[1].toLowerCase();
      b64 = match[2];
    }
    const buffer = Buffer.from(b64.includes(',') ? b64.split(',').pop()! : b64, 'base64');
    if (!buffer.length) throw new AppError('INVALID_MEDIA', 'Empty image payload.', 400);
    if (buffer.length > MAX_BYTES) {
      throw new AppError('FILE_TOO_LARGE', 'Image must be 8MB or smaller.', 400);
    }
    return toUploadFile(buffer, mime, bodyString(req.body, 'filename'));
  }

  const imageUrl = bodyString(req.body, 'imageUrl') || bodyString(req.body, 'url');
  if (!imageUrl) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new AppError('INVALID_MEDIA', 'imageUrl must be an absolute http(s) URL.', 400);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AppError('INVALID_MEDIA', 'imageUrl must use http or https.', 400);
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch(parsed.toString(), { signal: ac.signal, redirect: 'follow' });
    if (!res.ok) {
      throw new AppError('INVALID_MEDIA', `Could not download image (${res.status}).`, 400);
    }
    const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) throw new AppError('INVALID_MEDIA', 'Empty image payload.', 400);
    if (buffer.length > MAX_BYTES) {
      throw new AppError('FILE_TOO_LARGE', 'Image must be 8MB or smaller.', 400);
    }
    const filename = parsed.pathname.split('/').pop() || undefined;
    return toUploadFile(buffer, mime, filename);
  } finally {
    clearTimeout(timer);
  }
}

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
    const file = firstUploadedFile(req) || (await fileFromChatGptBody(req));
    if (!file) {
      throw new AppError(
        'FILE_REQUIRED',
        'Send a JPEG/PNG/WebP as multipart field "file" or "image", or JSON imageBase64 / imageUrl.',
        400
      );
    }
    const media = await uploadImageUsingChatGPT(file);
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
