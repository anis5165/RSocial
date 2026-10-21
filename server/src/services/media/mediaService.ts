import type { MediaPublic } from '@routism/shared';
import { env } from '../../config/env';
import { queryExec, queryRows } from '../../db/pool';
import { AppError } from '../../utils/errors';
import { newId } from '../../utils/ids';
import { utcToIso } from '../../utils/time';
import { deleteMedia as cloudinaryDelete, uploadMedia } from '../cloudinary/cloudinaryService';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg']);
const CHATGPT_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg']);
const CHATGPT_ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_BYTES = 8 * 1024 * 1024;
const MIN_DIMENSION = 320;

function mapMedia(row: Record<string, unknown>): MediaPublic {
  return {
    id: row.id as string,
    cloudinaryPublicId: row.cloudinary_public_id as string,
    secureUrl: row.secure_url as string,
    resourceType: row.resource_type as string,
    mimeType: row.mime_type as string,
    fileSize: Number(row.file_size),
    width: row.width != null ? Number(row.width) : null,
    height: row.height != null ? Number(row.height) : null,
    createdAt: utcToIso(row.created_at as Date | string) ?? new Date().toISOString(),
  };
}

function fileExtension(name: string): string {
  const lower = name.toLowerCase();
  return lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
}

function validateUpload(file: Express.Multer.File) {
  const mime = (file.mimetype || '').toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    throw new AppError('INVALID_MIME', 'Only JPEG/JPG images are allowed.', 400);
  }
  const ext = fileExtension(file.originalname || '');
  if (!ALLOWED_EXT.has(ext)) {
    throw new AppError('INVALID_EXTENSION', 'Only .jpg or .jpeg files are allowed.', 400);
  }
  if (file.size > MAX_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 'Image must be 8MB or smaller.', 400);
  }
}

function validateChatGptUpload(file: Express.Multer.File) {
  const mime = (file.mimetype || '').toLowerCase() || 'image/jpeg';
  if (!CHATGPT_ALLOWED_MIME.has(mime)) {
    throw new AppError('INVALID_MIME', 'ChatGPT uploads must be JPEG, PNG, or WebP.', 400);
  }
  const ext = fileExtension(file.originalname || '') || extFromMime(mime);
  if (ext && !CHATGPT_ALLOWED_EXT.has(ext)) {
    throw new AppError('INVALID_EXTENSION', 'ChatGPT uploads must be .jpg, .jpeg, .png, or .webp.', 400);
  }
  if (file.size > MAX_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 'Image must be 8MB or smaller.', 400);
  }
}

function extFromMime(mime: string): string {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  return '.jpg';
}

export function toUploadFile(buffer: Buffer, mimeType: string, filename?: string): Express.Multer.File {
  const mime = (mimeType || 'image/jpeg').toLowerCase();
  const name = filename || `upload${extFromMime(mime)}`;
  return {
    fieldname: 'file',
    originalname: name.includes('.') ? name : `${name}${extFromMime(mime)}`,
    encoding: '7bit',
    mimetype: mime,
    size: buffer.length,
    buffer,
    stream: undefined as unknown as Express.Multer.File['stream'],
    destination: '',
    filename: name,
    path: '',
  };
}

async function chatgptOwnerUserId(): Promise<string> {
  if (env.CHATGPT_UPLOAD_USER_ID) return env.CHATGPT_UPLOAD_USER_ID;
  const rows = await queryRows('SELECT id FROM rs_users ORDER BY created_at ASC LIMIT 1');
  if (!rows[0]) {
    throw new AppError(
      'NO_USER',
      'No Routism user exists to attach ChatGPT media to. Create an account first or set CHATGPT_UPLOAD_USER_ID.',
      503
    );
  }
  return String(rows[0].id);
}

/** MCP-compatible: uploadImage(userId, file) */
export async function uploadImage(
  userId: string,
  file: Express.Multer.File,
  opts?: { kinds?: 'jpeg' | 'chatgpt' }
): Promise<MediaPublic> {
  if (opts?.kinds === 'chatgpt') validateChatGptUpload(file);
  else validateUpload(file);

  const mediaId = newId();
  const result = await uploadMedia({
    buffer: file.buffer,
    userId,
    mediaId,
    mimeType: file.mimetype,
  });

  const width = result.width ?? null;
  const height = result.height ?? null;
  if (width && height && (width < MIN_DIMENSION || height < MIN_DIMENSION)) {
    await cloudinaryDelete(result.public_id).catch(() => undefined);
    throw new AppError(
      'IMAGE_TOO_SMALL',
      `Image must be at least ${MIN_DIMENSION}px on the shortest side.`,
      400
    );
  }

  await queryExec(
    `INSERT INTO rs_media
      (id, user_id, cloudinary_public_id, cloudinary_url, secure_url, resource_type, mime_type, file_size, width, height)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      mediaId,
      userId,
      result.public_id,
      result.url,
      result.secure_url,
      result.resource_type || 'image',
      file.mimetype,
      file.size,
      width,
      height,
    ]
  );

  return getMediaById(mediaId, userId);
}

/** Unauthenticated ChatGPT upload — stored under CHATGPT_UPLOAD_USER_ID or the first user. */
export async function uploadImageUsingChatGPT(file: Express.Multer.File): Promise<MediaPublic> {
  const userId = await chatgptOwnerUserId();
  const mime = (file.mimetype || 'image/jpeg').toLowerCase();
  const named = file.originalname?.includes('.')
    ? file
    : { ...file, originalname: `${file.originalname || 'upload'}${extFromMime(mime)}` };
  return uploadImage(userId, named, { kinds: 'chatgpt' });
}

export async function listMedia(
  userId: string,
  opts: { search?: string; limit?: number; offset?: number } = {}
): Promise<MediaPublic[]> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const offset = opts.offset ?? 0;
  const search = opts.search?.trim();

  let sql = `SELECT * FROM rs_media WHERE user_id = ?`;
  const params: Array<string | number> = [userId];
  if (search) {
    sql += ` AND (cloudinary_public_id LIKE ? OR id LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ` ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

  const rows = await queryRows(sql, params);
  return rows.map(mapMedia);
}

export async function getMediaById(mediaId: string, userId: string): Promise<MediaPublic> {
  const rows = await queryRows(
    'SELECT * FROM rs_media WHERE id = ? AND user_id = ? LIMIT 1',
    [mediaId, userId]
  );
  if (!rows[0]) throw new AppError('MEDIA_NOT_FOUND', 'Media not found.', 404);
  return mapMedia(rows[0]);
}

export async function deleteUserMedia(mediaId: string, userId: string): Promise<void> {
  const rows = await queryRows(
    'SELECT * FROM rs_media WHERE id = ? AND user_id = ? LIMIT 1',
    [mediaId, userId]
  );
  if (!rows[0]) throw new AppError('MEDIA_NOT_FOUND', 'Media not found.', 404);

  const inUse = await queryRows(
    `SELECT id FROM rs_posts
     WHERE media_id = ? AND user_id = ?
       AND status IN ('scheduled','publishing','published')
     LIMIT 1`,
    [mediaId, userId]
  );
  if (inUse[0]) {
    throw new AppError(
      'MEDIA_IN_USE',
      'Media is used by an active post and cannot be deleted.',
      409
    );
  }

  await cloudinaryDelete(rows[0].cloudinary_public_id as string).catch(() => undefined);
  await queryExec('DELETE FROM rs_media WHERE id = ? AND user_id = ?', [mediaId, userId]);
}
