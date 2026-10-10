import type { SettingsPublic } from '@routism/shared';
import { queryRows } from '../../db/pool';
import { AppError } from '../../utils/errors';
import { assertTimezone } from '../../utils/time';
import { updateUserSettings } from '../auth/authService';
import { getInstagramAccountForUser } from '../accounts/accountsService';
import {
  isCloudinaryConfigured,
  maskCloudName,
  maskPreset,
} from '../cloudinary/cloudinaryService';
import { env } from '../../config/env';
import { isInstagramConfigured } from '../instagram/instagramApi';

export async function getSettings(userId: string): Promise<SettingsPublic> {
  const rows = await queryRows(
    'SELECT email, name, timezone FROM rs_users WHERE id = ? LIMIT 1',
    [userId]
  );
  const user = rows[0];
  if (!user) throw new AppError('USER_NOT_FOUND', 'User not found.', 404);

  const ig = await getInstagramAccountForUser(userId);
  let tokenStatus: string | null = null;
  if (ig) {
    if (ig.token_expires_at && new Date(ig.token_expires_at).getTime() < Date.now()) {
      tokenStatus = 'expired';
    } else {
      tokenStatus = 'valid';
    }
  }

  return {
    account: {
      email: user.email,
      name: user.name,
      timezone: user.timezone,
    },
    instagram: {
      connected: Boolean(ig) && isInstagramConfigured(),
      username: ig?.username ?? null,
      tokenStatus: ig ? tokenStatus : isInstagramConfigured() ? 'not_connected' : 'not_configured',
    },
    cloudinary: {
      connected: isCloudinaryConfigured(),
      cloudNameMasked: maskCloudName(env.CLOUDINARY_CLOUD_NAME),
      uploadPresetMasked: maskPreset(env.CLOUDINARY_UPLOAD_PRESET),
    },
  };
}

export async function patchSettings(
  userId: string,
  input: { name?: string; timezone?: string }
) {
  if (input.timezone) assertTimezone(input.timezone);
  const user = await updateUserSettings(userId, input);
  return getSettings(user.id);
}
