import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export interface CloudinaryUploadResult {
  public_id: string;
  url: string;
  secure_url: string;
  resource_type: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
  version?: number | string;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_UPLOAD_PRESET);
}

function ensureConfigured() {
  if (!isCloudinaryConfigured()) {
    throw new AppError(
      'CLOUDINARY_NOT_CONFIGURED',
      'Cloudinary is not configured (cloud name + unsigned upload preset required).',
      503
    );
  }
}

async function postUnsignedUpload(form: FormData): Promise<CloudinaryUploadResult> {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const res = await fetch(endpoint, {
    method: 'POST',
    body: form,
  });

  const data = (await res.json()) as CloudinaryUploadResult & {
    error?: { message?: string };
  };

  if (!res.ok || data.error || !data.secure_url || !data.public_id) {
    const message = data.error?.message || 'Failed to upload media to Cloudinary.';
    throw new AppError('CLOUDINARY_UPLOAD_FAILED', message, 502);
  }

  return {
    public_id: data.public_id,
    url: data.url,
    secure_url: data.secure_url,
    resource_type: data.resource_type || 'image',
    width: data.width,
    height: data.height,
    bytes: data.bytes,
    format: data.format,
    version: data.version,
  };
}

function buildForm(params: {
  buffer: Buffer;
  mediaId: string;
  mimeType: string;
  publicId?: string;
}): FormData {
  const form = new FormData();
  const bytes = new Uint8Array(params.buffer);
  const blob = new Blob([bytes], { type: params.mimeType || 'image/jpeg' });
  form.append('file', blob, `${params.mediaId}.jpg`);
  form.append('upload_preset', env.CLOUDINARY_UPLOAD_PRESET);
  if (params.publicId) {
    form.append('public_id', params.publicId);
  }
  return form;
}

/**
 * Unsigned upload via upload preset — no API key/secret.
 * POST https://api.cloudinary.com/v1_1/{cloud_name}/image/upload
 *
 * Delivery URL:
 * https://res.cloudinary.com/{cloud_name}/image/upload/{public_id}.{ext}
 */
export async function uploadMedia(params: {
  buffer: Buffer;
  userId: string;
  mediaId: string;
  mimeType: string;
}): Promise<CloudinaryUploadResult> {
  ensureConfigured();

  const publicId = `routism-social/${params.userId}/media/${params.mediaId}`;

  try {
    return await postUnsignedUpload(
      buildForm({
        buffer: params.buffer,
        mediaId: params.mediaId,
        mimeType: params.mimeType,
        publicId,
      })
    );
  } catch (err) {
    // Some unsigned presets disallow overriding public_id — retry without it
    const message = err instanceof AppError ? err.message.toLowerCase() : '';
    if (
      message.includes('public_id') ||
      message.includes('preset') ||
      message.includes('unauthorized')
    ) {
      logger.warn('cloudinary_retry_without_public_id', { message });
      return postUnsignedUpload(
        buildForm({
          buffer: params.buffer,
          mediaId: params.mediaId,
          mimeType: params.mimeType,
        })
      );
    }
    throw err;
  }
}

/**
 * Without API secret we cannot destroy remote assets.
 * Callers should still remove the MySQL row.
 */
export async function deleteMedia(publicId: string): Promise<void> {
  logger.info('cloudinary_remote_delete_skipped', {
    publicId,
    reason: 'unsigned_preset_mode_no_api_secret',
  });
}

export async function getMedia(publicId: string): Promise<{ secure_url: string }> {
  ensureConfigured();
  const secure_url = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/${publicId}`;
  return { secure_url };
}

export function maskCloudName(name: string | undefined | null): string | null {
  if (!name) return null;
  if (name.length <= 4) return '****';
  return `${name.slice(0, 2)}****${name.slice(-2)}`;
}

export function maskPreset(preset: string | undefined | null): string {
  if (!preset) return '—';
  if (preset.length <= 2) return '••••';
  return `${preset.slice(0, 1)}••••${preset.slice(-1)}`;
}
