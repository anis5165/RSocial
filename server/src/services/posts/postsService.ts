import { RowDataPacket } from 'mysql2';
import type { PostPublic, PostStatus } from '@routism/shared';
import { queryExec, queryRows } from '../../db/pool';
import { AppError } from '../../utils/errors';
import { newId } from '../../utils/ids';
import { assertTimezone, localToUtc, toMysqlUtc, utcToIso } from '../../utils/time';
import { getMediaById } from '../media/mediaService';
import { listConnectedAccounts } from '../accounts/accountsService';
import type { DeliveryPublic } from '@routism/shared';

function mapDelivery(row: RowDataPacket): DeliveryPublic {
  return {
    id: row.id,
    postId: row.post_id,
    accountId: row.account_id,
    status: row.status,
    remotePostId: row.remote_post_id,
    errorMessage: row.error_message,
    createdAt: utcToIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: utcToIso(row.updated_at) ?? new Date().toISOString(),
  };
}

async function mapPost(row: RowDataPacket, userId: string): Promise<PostPublic> {
  let media = null;
  if (row.media_id) {
    try {
      media = await getMediaById(row.media_id, userId);
    } catch {
      media = null;
    }
  }

  const deliveries = await queryRows(
    `SELECT d.* FROM rs_deliveries d
     INNER JOIN rs_posts p ON p.id = d.post_id
     WHERE d.post_id = ? AND p.user_id = ?
     ORDER BY d.created_at DESC`,
    [row.id, userId]
  );

  return {
    id: row.id,
    caption: row.caption,
    mediaId: row.media_id,
    media,
    scheduledAt: utcToIso(row.scheduled_at),
    timezone: row.timezone,
    status: row.status as PostStatus,
    errorMessage: row.error_message,
    createdAt: utcToIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: utcToIso(row.updated_at) ?? new Date().toISOString(),
    deliveries: deliveries.map(mapDelivery),
  };
}

/** MCP-compatible: createPost(userId, data) */
export async function createPost(
  userId: string,
  data: { caption: string; mediaId: string }
): Promise<PostPublic> {
  const caption = data.caption?.trim() ?? '';
  if (!caption) throw new AppError('CAPTION_REQUIRED', 'Caption is required.', 400);
  if (caption.length > 2200) {
    throw new AppError('CAPTION_TOO_LONG', 'Caption must be 2200 characters or fewer.', 400);
  }

  await getMediaById(data.mediaId, userId);

  const id = newId();
  const userRows = await queryRows('SELECT timezone FROM rs_users WHERE id = ? LIMIT 1', [userId]);
  const timezone = userRows[0]?.timezone || 'Asia/Kolkata';

  await queryExec(
    `INSERT INTO rs_posts (id, user_id, caption, media_id, scheduled_at, timezone, status)
     VALUES (?, ?, ?, ?, NULL, ?, 'draft')`,
    [id, userId, caption, data.mediaId, timezone]
  );

  return getPostById(id, userId);
}

export async function listPosts(
  userId: string,
  opts: { status?: PostStatus | 'all'; limit?: number; offset?: number } = {}
): Promise<PostPublic[]> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const offset = opts.offset ?? 0;
  let sql = `SELECT * FROM rs_posts WHERE user_id = ?`;
  const params: Array<string | number> = [userId];
  if (opts.status && opts.status !== 'all') {
    sql += ` AND status = ?`;
    params.push(opts.status);
  }
  sql += ` ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

  const rows = await queryRows(sql, params);
  return Promise.all(rows.map((r) => mapPost(r, userId)));
}

/** MCP-compatible: getPostStatus(postId, userId) */
export async function getPostById(postId: string, userId: string): Promise<PostPublic> {
  const rows = await queryRows(
    'SELECT * FROM rs_posts WHERE id = ? AND user_id = ? LIMIT 1',
    [postId, userId]
  );
  if (!rows[0]) throw new AppError('POST_NOT_FOUND', 'Post not found.', 404);
  return mapPost(rows[0], userId);
}

export async function updatePost(
  postId: string,
  userId: string,
  data: { caption?: string; mediaId?: string }
): Promise<PostPublic> {
  const rows = await queryRows(
    'SELECT * FROM rs_posts WHERE id = ? AND user_id = ? LIMIT 1',
    [postId, userId]
  );
  const post = rows[0];
  if (!post) throw new AppError('POST_NOT_FOUND', 'Post not found.', 404);

  if (!['draft', 'scheduled', 'failed', 'needs_review'].includes(post.status)) {
    throw new AppError('POST_NOT_EDITABLE', 'Post cannot be edited in its current status.', 409);
  }

  let caption = post.caption;
  let mediaId = post.media_id;

  if (data.caption !== undefined) {
    caption = data.caption.trim();
    if (!caption) throw new AppError('CAPTION_REQUIRED', 'Caption is required.', 400);
    if (caption.length > 2200) {
      throw new AppError('CAPTION_TOO_LONG', 'Caption must be 2200 characters or fewer.', 400);
    }
  }
  if (data.mediaId !== undefined) {
    await getMediaById(data.mediaId, userId);
    mediaId = data.mediaId;
  }

  await queryExec(
    `UPDATE rs_posts SET caption = ?, media_id = ?, error_message = NULL
     WHERE id = ? AND user_id = ?`,
    [caption, mediaId, postId, userId]
  );

  return getPostById(postId, userId);
}

/** MCP-compatible: schedulePost(userId, data) */
export async function schedulePost(
  userId: string,
  data: {
    postId: string;
    date: string;
    time: string;
    timezone: string;
  }
): Promise<PostPublic> {
  const tz = assertTimezone(data.timezone);
  const scheduledAt = localToUtc(data.date, data.time, tz);
  if (scheduledAt.getTime() <= Date.now()) {
    throw new AppError('SCHEDULE_IN_PAST', 'Scheduled time must be in the future.', 400);
  }

  const rows = await queryRows(
    'SELECT * FROM rs_posts WHERE id = ? AND user_id = ? LIMIT 1',
    [data.postId, userId]
  );
  const post = rows[0];
  if (!post) throw new AppError('POST_NOT_FOUND', 'Post not found.', 404);

  if (!['draft', 'scheduled', 'failed', 'needs_review'].includes(post.status)) {
    throw new AppError('POST_NOT_SCHEDULABLE', 'Post cannot be scheduled in its current status.', 409);
  }
  if (!post.media_id) {
    throw new AppError('MEDIA_REQUIRED', 'Post requires media before scheduling.', 400);
  }

  const accounts = await listConnectedAccounts(userId);
  if (!accounts.some((a) => a.platform === 'instagram' && a.status === 'connected')) {
    throw new AppError('INSTAGRAM_NOT_CONNECTED', 'Connect Instagram before scheduling.', 400);
  }

  await queryExec(
    `UPDATE rs_posts
     SET status = 'scheduled', scheduled_at = ?, timezone = ?, error_message = NULL, publish_lock_token = NULL
     WHERE id = ? AND user_id = ? AND status IN ('draft','scheduled','failed','needs_review')`,
    [toMysqlUtc(scheduledAt), tz, data.postId, userId]
  );

  return getPostById(data.postId, userId);
}

/** MCP-compatible: cancelPost(postId, userId) */
export async function cancelPost(postId: string, userId: string): Promise<PostPublic> {
  const result = await queryExec(
    `UPDATE rs_posts
     SET status = 'draft', scheduled_at = NULL, publish_lock_token = NULL, error_message = NULL
     WHERE id = ? AND user_id = ? AND status = 'scheduled'`,
    [postId, userId]
  );
  if (result.affectedRows === 0) {
    throw new AppError(
      'POST_NOT_CANCELLABLE',
      'Only scheduled posts can be cancelled.',
      409
    );
  }
  return getPostById(postId, userId);
}

export async function markNeedsReview(postId: string, userId: string, message: string) {
  await queryExec(
    `UPDATE rs_posts SET status = 'needs_review', error_message = ?
     WHERE id = ? AND user_id = ?`,
    [message, postId, userId]
  );
}
