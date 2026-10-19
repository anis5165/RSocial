/**
 * Shared publishing actions for MCP tools and ChatGPT Plugin/App Actions.
 * All paths resolve userId from authentication — never from tool arguments.
 */
import { DateTime } from 'luxon';
import {
  listConnectedAccounts,
  getAccountById,
} from '../../services/accounts/accountsService';
import { uploadImage } from '../../services/media/mediaService';
import {
  cancelPost,
  createPost,
  getPostById,
  listPosts,
  schedulePost,
} from '../../services/posts/postsService';
import { publishPost, retryPost } from '../../services/posts/publishService';
import { withIdempotency } from '../../services/idempotency/idempotencyService';
import { AppError } from '../../utils/errors';
import { assertTimezone } from '../../utils/time';
import { queryRows } from '../../db/pool';

function toMulterFile(buffer: Buffer, mimeType: string, filename: string): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: filename,
    encoding: '7bit',
    mimetype: mimeType,
    size: buffer.length,
    buffer,
    stream: undefined as unknown as Express.Multer.File['stream'],
    destination: '',
    filename,
    path: '',
  };
}

export function parseScheduleInput(scheduledAt: string, timezone: string) {
  const tz = assertTimezone(timezone);
  let dt = DateTime.fromISO(scheduledAt, { zone: tz });
  if (!dt.isValid) dt = DateTime.fromSQL(scheduledAt, { zone: tz });
  if (!dt.isValid) dt = DateTime.fromFormat(scheduledAt, 'yyyy-MM-dd HH:mm', { zone: tz });
  if (!dt.isValid) dt = DateTime.fromFormat(scheduledAt, 'yyyy-MM-dd HH:mm:ss', { zone: tz });
  if (!dt.isValid) {
    throw new AppError(
      'INVALID_SCHEDULE_TIME',
      'Invalid scheduledAt. Use ISO local datetime like 2026-10-20T19:00:00 in the given timezone.',
      400
    );
  }
  return {
    date: dt.toFormat('yyyy-MM-dd'),
    time: dt.toFormat('HH:mm:ss'),
    timezone: tz,
  };
}

async function resolveAccountUsername(userId: string, accountId?: string | null) {
  if (accountId) {
    const account = await getAccountById(accountId, userId);
    if (account.platform !== 'instagram') {
      throw new AppError('ACCOUNT_NOT_FOUND', 'Only Instagram accounts are supported.', 404);
    }
    if (account.status !== 'connected') {
      throw new AppError('INSTAGRAM_NOT_CONNECTED', 'Selected Instagram account is not connected.', 400);
    }
    return account.username.replace(/^@/, '');
  }
  const accounts = await listConnectedAccounts(userId);
  const ig = accounts.filter((a) => a.platform === 'instagram' && a.status === 'connected');
  if (!ig.length) {
    throw new AppError('INSTAGRAM_NOT_CONNECTED', 'No connected Instagram account is available.', 400);
  }
  return ig[0].username.replace(/^@/, '');
}

export async function actionListConnectedAccounts(userId: string) {
  const accounts = await listConnectedAccounts(userId);
  return {
    accounts: accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      username: a.username.replace(/^@/, ''),
      status: a.status,
    })),
  };
}

export async function actionUploadMedia(
  userId: string,
  input: {
    imageBase64: string;
    mimeType?: string;
    filename?: string;
    idempotencyKey?: string;
  }
) {
  return withIdempotency({
    userId,
    key: input.idempotencyKey,
    operation: 'upload_media',
    request: {
      mimeType: input.mimeType || 'image/jpeg',
      filename: input.filename || 'upload.jpg',
      bytes: Buffer.from(
        input.imageBase64.includes(',')
          ? input.imageBase64.split(',').pop()!
          : input.imageBase64,
        'base64'
      ).length,
    },
    execute: async () => {
      let b64 = input.imageBase64.trim();
      let mime = (input.mimeType || 'image/jpeg').toLowerCase();
      if (b64.startsWith('data:')) {
        const match = /^data:([^;]+);base64,(.+)$/s.exec(b64);
        if (!match) throw new AppError('INVALID_MEDIA', 'Invalid data URL.', 400);
        mime = match[1].toLowerCase();
        b64 = match[2];
      }
      const buffer = Buffer.from(b64, 'base64');
      if (!buffer.length) throw new AppError('INVALID_MEDIA', 'Empty image payload.', 400);
      const filename = input.filename || 'upload.jpg';
      const media = await uploadImage(userId, toMulterFile(buffer, mime, filename));
      return {
        mediaId: media.id,
        secureUrl: media.secureUrl,
        mimeType: media.mimeType,
        width: media.width,
        height: media.height,
      };
    },
  });
}

export async function actionCreatePost(
  userId: string,
  input: {
    caption: string;
    mediaId: string;
    accountId?: string;
    idempotencyKey?: string;
  }
) {
  return withIdempotency({
    userId,
    key: input.idempotencyKey,
    operation: 'create_post',
    request: {
      caption: input.caption,
      mediaId: input.mediaId,
      accountId: input.accountId || null,
    },
    execute: async () => {
      const accountUsername = await resolveAccountUsername(userId, input.accountId);
      const post = await createPost(userId, {
        caption: input.caption,
        mediaId: input.mediaId,
      });
      return {
        postId: post.id,
        status: post.status,
        platform: 'instagram' as const,
        accountUsername,
      };
    },
  });
}

export async function actionSchedulePost(
  userId: string,
  input: {
    postId: string;
    scheduledAt: string;
    timezone?: string;
    idempotencyKey?: string;
  }
) {
  const userRows = await queryRows('SELECT timezone FROM rs_users WHERE id = ? LIMIT 1', [userId]);
  const defaultTz = (userRows[0]?.timezone as string) || 'Asia/Kolkata';

  return withIdempotency({
    userId,
    key: input.idempotencyKey,
    operation: 'schedule_post',
    request: {
      postId: input.postId,
      scheduledAt: input.scheduledAt,
      timezone: input.timezone || defaultTz,
    },
    execute: async () => {
      const parsed = parseScheduleInput(input.scheduledAt, input.timezone || defaultTz);
      const post = await schedulePost(userId, {
        postId: input.postId,
        ...parsed,
      });
      return {
        postId: post.id,
        status: post.status,
        scheduledAt: post.scheduledAt,
        timezone: post.timezone,
      };
    },
  });
}

export async function actionPublishPost(
  userId: string,
  input: { postId: string; idempotencyKey?: string }
) {
  return withIdempotency({
    userId,
    key: input.idempotencyKey || `publish:${input.postId}`,
    operation: 'publish_post',
    request: { postId: input.postId },
    execute: async () => {
      const post = await publishPost(input.postId, userId);
      const delivery = post.deliveries?.find((d) => d.status === 'published') || post.deliveries?.[0];
      let accountUsername: string | null = null;
      try {
        accountUsername = await resolveAccountUsername(userId);
      } catch {
        accountUsername = null;
      }
      return {
        postId: post.id,
        status: post.status,
        remotePostId: delivery?.remotePostId || null,
        accountUsername,
        errorMessage: post.errorMessage,
      };
    },
  });
}

export async function actionCancelScheduledPost(userId: string, postId: string) {
  const post = await cancelPost(postId, userId);
  return { postId: post.id, status: post.status };
}

export async function actionGetPostStatus(userId: string, postId: string) {
  const post = await getPostById(postId, userId);
  const delivery = post.deliveries?.find((d) => d.remotePostId) || post.deliveries?.[0];
  let accountUsername: string | null = null;
  try {
    accountUsername = await resolveAccountUsername(userId);
  } catch {
    accountUsername = null;
  }
  return {
    postId: post.id,
    status: post.status,
    scheduledAt: post.scheduledAt,
    timezone: post.timezone,
    remotePostId: delivery?.remotePostId || null,
    accountUsername,
    errorMessage: post.errorMessage,
  };
}

export async function actionListScheduledPosts(
  userId: string,
  opts: { from?: string; to?: string; accountId?: string } = {}
) {
  if (opts.accountId) {
    await getAccountById(opts.accountId, userId);
  }
  const posts = await listPosts(userId, { status: 'scheduled', limit: 50 });
  let filtered = posts;
  if (opts.from) {
    const from = Date.parse(opts.from);
    if (!Number.isNaN(from)) {
      filtered = filtered.filter((p) => p.scheduledAt && Date.parse(p.scheduledAt) >= from);
    }
  }
  if (opts.to) {
    const to = Date.parse(opts.to);
    if (!Number.isNaN(to)) {
      filtered = filtered.filter((p) => p.scheduledAt && Date.parse(p.scheduledAt) <= to);
    }
  }

  let accountUsername = 'unknown';
  try {
    accountUsername = await resolveAccountUsername(userId, opts.accountId);
  } catch {
    /* keep unknown */
  }

  return {
    posts: filtered.map((p) => ({
      postId: p.id,
      caption: p.caption.slice(0, 280),
      scheduledAt: p.scheduledAt,
      timezone: p.timezone,
      accountUsername,
      status: p.status,
    })),
  };
}

export async function actionRetryPost(
  userId: string,
  input: { postId: string; idempotencyKey?: string }
) {
  return withIdempotency({
    userId,
    key: input.idempotencyKey || `retry:${input.postId}`,
    operation: 'retry_post',
    request: { postId: input.postId },
    execute: async () => {
      const post = await retryPost(input.postId, userId);
      const delivery = post.deliveries?.find((d) => d.status === 'published') || post.deliveries?.[0];
      return {
        postId: post.id,
        status: post.status,
        remotePostId: delivery?.remotePostId || null,
        errorMessage: post.errorMessage,
      };
    },
  });
}
