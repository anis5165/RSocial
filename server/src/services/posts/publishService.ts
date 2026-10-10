import { RowDataPacket } from 'mysql2';
import type { PostPublic } from '@routism/shared';
import { pool, queryExec, queryRows } from '../../db/pool';
import { AppError } from '../../utils/errors';
import { newId } from '../../utils/ids';
import { toMysqlUtc } from '../../utils/time';
import { logger } from '../../utils/logger';
import { getValidInstagramAccessToken } from '../accounts/accountsService';
import {
  createImageContainer,
  publishContainer,
  waitForContainerReady,
} from '../instagram/instagramApi';
import { getPostById } from './postsService';

const PUBLISHABLE = new Set(['draft', 'scheduled', 'failed', 'needs_review']);

function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]')
    .replace(/EAA[A-Za-z0-9]+/g, '[redacted]')
    .slice(0, 500);
}

async function findSuccessfulDelivery(postId: string, userId: string) {
  return queryRows(
    `SELECT d.* FROM rs_deliveries d
     INNER JOIN rs_posts p ON p.id = d.post_id
     WHERE d.post_id = ? AND p.user_id = ?
       AND d.status = 'published' AND d.remote_post_id IS NOT NULL
     LIMIT 1`,
    [postId, userId]
  );
}

async function markPublished(postId: string, userId: string) {
  await queryExec(
    `UPDATE rs_posts
     SET status = 'published',
         published_at = COALESCE(published_at, UTC_TIMESTAMP(3)),
         error_message = NULL,
         publish_lock_token = NULL
     WHERE id = ? AND user_id = ?`,
    [postId, userId]
  );
}

async function runPublishCore(
  postId: string,
  userId: string,
  lockToken: string
): Promise<PostPublic> {
  const idempotencyKey = `ig-publish:${postId}`;

  try {
    const successful = await findSuccessfulDelivery(postId, userId);
    if (successful[0]) {
      await markPublished(postId, userId);
      logger.info('publish_skipped_already_published', { postId, userId });
      return getPostById(postId, userId);
    }

    const postRows = await queryRows(
      `SELECT * FROM rs_posts
       WHERE id = ? AND user_id = ? AND publish_lock_token = ? AND status = 'publishing'
       LIMIT 1`,
      [postId, userId, lockToken]
    );
    const post = postRows[0];
    if (!post) {
      throw new AppError('PUBLISH_CLAIM_LOST', 'Publish lock was lost.', 409);
    }
    if (!post.media_id) {
      throw new AppError('MEDIA_REQUIRED', 'Post requires media before publishing.', 400);
    }

    const mediaRows = await queryRows(
      'SELECT * FROM rs_media WHERE id = ? AND user_id = ? LIMIT 1',
      [post.media_id, userId]
    );
    const media = mediaRows[0];
    if (!media?.secure_url) {
      throw new AppError('MEDIA_NOT_FOUND', 'Media not found for this post.', 404);
    }

    const { account, accessToken } = await getValidInstagramAccessToken(userId);

    let deliveryId: string;
    const prior = await queryRows(
      'SELECT * FROM rs_deliveries WHERE idempotency_key = ? LIMIT 1',
      [idempotencyKey]
    );

    if (prior[0]) {
      if (prior[0].status === 'published' && prior[0].remote_post_id) {
        await markPublished(postId, userId);
        return getPostById(postId, userId);
      }
      deliveryId = prior[0].id;
      await queryExec(
        `UPDATE rs_deliveries SET status = 'publishing', error_message = NULL WHERE id = ?`,
        [deliveryId]
      );
    } else {
      deliveryId = newId();
      try {
        await queryExec(
          `INSERT INTO rs_deliveries
            (id, post_id, account_id, status, remote_post_id, response, error_message, idempotency_key)
           VALUES (?, ?, ?, 'publishing', NULL, NULL, NULL, ?)`,
          [deliveryId, postId, account.id, idempotencyKey]
        );
      } catch {
        const again = await queryRows(
          'SELECT * FROM rs_deliveries WHERE idempotency_key = ? LIMIT 1',
          [idempotencyKey]
        );
        if (again[0]?.status === 'published' && again[0].remote_post_id) {
          await markPublished(postId, userId);
          return getPostById(postId, userId);
        }
        deliveryId = again[0]?.id || deliveryId;
        await queryExec(
          `UPDATE rs_deliveries SET status = 'publishing', error_message = NULL WHERE id = ?`,
          [deliveryId]
        );
      }
    }

    logger.info('publish_started', {
      postId,
      userId,
      accountId: account.id,
      deliveryId,
    });

    const containerId = await createImageContainer({
      igUserId: account.platform_account_id,
      accessToken,
      imageUrl: media.secure_url,
      caption: post.caption,
    });

    await waitForContainerReady({ containerId, accessToken });

    const remotePostId = await publishContainer({
      igUserId: account.platform_account_id,
      accessToken,
      creationId: containerId,
    });

    await queryExec(
      `UPDATE rs_deliveries
       SET status = 'published', remote_post_id = ?, response = ?, error_message = NULL
       WHERE id = ?`,
      [
        remotePostId,
        JSON.stringify({ containerId, remotePostId, platform: 'instagram' }),
        deliveryId,
      ]
    );

    await queryExec(
      `UPDATE rs_posts
       SET status = 'published', published_at = ?, error_message = NULL, publish_lock_token = NULL
       WHERE id = ? AND user_id = ? AND publish_lock_token = ?`,
      [toMysqlUtc(new Date()), postId, userId, lockToken]
    );

    logger.info('publish_succeeded', { postId, userId, remotePostId });
    return getPostById(postId, userId);
  } catch (err) {
    const message =
      err instanceof AppError
        ? err.message
        : 'Publishing failed due to an unexpected error.';
    const safeMessage = sanitizeErrorMessage(message);

    await queryExec(
      `UPDATE rs_posts
       SET status = 'failed', error_message = ?, publish_lock_token = NULL
       WHERE id = ? AND user_id = ?`,
      [safeMessage, postId, userId]
    );
    await queryExec(
      `UPDATE rs_deliveries
       SET status = 'failed', error_message = ?
       WHERE post_id = ? AND status = 'publishing'`,
      [safeMessage, postId]
    );

    logger.error('publish_failed', { postId, userId, message: safeMessage });

    if (err instanceof AppError) {
      throw new AppError(err.code, safeMessage, err.statusCode);
    }
    throw new AppError('PUBLISH_FAILED', safeMessage, 502);
  }
}

/**
 * Central publishing implementation.
 * Website, scheduler, and future MCP must all call this function.
 */
export async function publishPost(postId: string, userId: string): Promise<PostPublic> {
  const existing = await queryRows(
    'SELECT * FROM rs_posts WHERE id = ? AND user_id = ? LIMIT 1',
    [postId, userId]
  );
  if (!existing[0]) {
    throw new AppError('POST_NOT_FOUND', 'Post not found.', 404);
  }

  const successful = await findSuccessfulDelivery(postId, userId);
  if (successful[0] || existing[0].status === 'published') {
    await markPublished(postId, userId);
    logger.info('publish_skipped_already_published', { postId, userId });
    return getPostById(postId, userId);
  }

  if (existing[0].status === 'publishing') {
    throw new AppError(
      'PUBLISH_IN_PROGRESS',
      'Publishing is already in progress for this post.',
      409
    );
  }

  if (!PUBLISHABLE.has(existing[0].status)) {
    throw new AppError(
      'POST_NOT_PUBLISHABLE',
      'Post cannot be published in its current status.',
      409
    );
  }

  const lockToken = newId();
  const claim = await queryExec(
    `UPDATE rs_posts
     SET status = 'publishing', publish_lock_token = ?, error_message = NULL
     WHERE id = ? AND user_id = ?
       AND status IN ('draft','scheduled','failed','needs_review')`,
    [lockToken, postId, userId]
  );

  if (claim.affectedRows === 0) {
    throw new AppError(
      'PUBLISH_CLAIM_FAILED',
      'Could not claim post for publishing. It may already be publishing.',
      409
    );
  }

  return runPublishCore(postId, userId, lockToken);
}

/**
 * Atomically claim one due scheduled post (FOR UPDATE).
 */
export async function claimDueScheduledPost(): Promise<{
  postId: string;
  userId: string;
  lockToken: string;
} | null> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT id, user_id FROM rs_posts
       WHERE status = 'scheduled'
         AND scheduled_at IS NOT NULL
         AND scheduled_at <= UTC_TIMESTAMP(3)
       ORDER BY scheduled_at ASC
       LIMIT 1
       FOR UPDATE`
    );

    const row = rows[0];
    if (!row) {
      await conn.commit();
      return null;
    }

    const lockToken = newId();
    const [result] = await conn.execute(
      `UPDATE rs_posts
       SET status = 'publishing', publish_lock_token = ?, error_message = NULL
       WHERE id = ? AND status = 'scheduled'`,
      [lockToken, row.id]
    );

    const header = result as { affectedRows?: number };
    if (!header.affectedRows) {
      await conn.commit();
      return null;
    }

    await conn.commit();
    return { postId: row.id, userId: row.user_id, lockToken };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Continue publishing after scheduler atomic claim. */
export async function publishClaimedPost(
  postId: string,
  userId: string,
  lockToken: string
): Promise<PostPublic> {
  return runPublishCore(postId, userId, lockToken);
}

/** Retry failed post — checks delivery before republishing. */
export async function retryPost(postId: string, userId: string): Promise<PostPublic> {
  const rows = await queryRows(
    'SELECT * FROM rs_posts WHERE id = ? AND user_id = ? LIMIT 1',
    [postId, userId]
  );
  if (!rows[0]) throw new AppError('POST_NOT_FOUND', 'Post not found.', 404);
  if (rows[0].status !== 'failed' && rows[0].status !== 'needs_review') {
    throw new AppError('POST_NOT_RETRYABLE', 'Only failed posts can be retried.', 409);
  }

  const successful = await findSuccessfulDelivery(postId, userId);
  if (successful[0]) {
    await markPublished(postId, userId);
    return getPostById(postId, userId);
  }

  // Allow a new idempotency key only when no remote post was created
  await queryExec(
    `UPDATE rs_deliveries
     SET idempotency_key = NULL
     WHERE post_id = ? AND status = 'failed' AND remote_post_id IS NULL`,
    [postId]
  );

  return publishPost(postId, userId);
}
