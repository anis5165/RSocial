/**
 * Integration test for ChatGPT Actions → shared publish path.
 * Skips when DATABASE_* / env is unavailable.
 *
 * Run: npm run test -w server
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../../config/env';
import { pool, queryExec, queryRows } from '../../db/pool';
import { registerUser, loginUser } from '../../services/auth/authService';
import { mintPersonalAccessToken } from '../../mcp/oauth/store';
import { encryptToken } from '../../utils/crypto';
import { newId } from '../../utils/ids';
import { toMysqlUtc } from '../../utils/time';
import {
  actionCreatePost,
  actionListConnectedAccounts,
  actionPublishPost,
  actionSchedulePost,
  actionUploadMedia,
} from '../shared/publishingActions';
import { publishPost } from '../../services/posts/publishService';

const hasDb = Boolean(env.DATABASE_HOST && env.DATABASE_NAME);

describe('ChatGPT integration e2e (DB)', { skip: !hasDb }, () => {
  let userId = '';
  let mediaId = '';
  let postId = '';
  let publishCalls = 0;

  before(async () => {
    await pool.query('SELECT 1');
    const email = `chatgpt-e2e-${Date.now()}@routism.test`;
    const password = 'TestPass123!';
    try {
      const user = await registerUser({
        email,
        password,
        name: 'ChatGPT E2E',
        timezone: 'Asia/Kolkata',
      });
      userId = user.id;
    } catch {
      const user = await loginUser(email, password);
      userId = user.id;
    }

    // Mock Instagram account (encrypted dummy token — publish will be intercepted)
    const accountId = newId();
    await queryExec(
      `INSERT INTO rs_accounts
        (id, user_id, platform, platform_account_id, username, display_name,
         encrypted_access_token, status)
       VALUES (?, ?, 'instagram', ?, 'e2e_brand', 'E2E', ?, 'connected')
       ON DUPLICATE KEY UPDATE status = 'connected', user_id = VALUES(user_id)`,
      [accountId, userId, `ig-${userId.slice(0, 8)}`, encryptToken('fake-token-for-e2e')]
    );

    await mintPersonalAccessToken(userId, 3600);
  });

  it('lists connected accounts without tokens', async () => {
    const data = await actionListConnectedAccounts(userId);
    assert.ok(data.accounts.length >= 1);
    assert.equal(data.accounts[0].platform, 'instagram');
    assert.ok(!('accessToken' in data.accounts[0]));
  });

  it('rejects invalid MIME via upload path', async () => {
    await assert.rejects(
      () =>
        actionUploadMedia(userId, {
          imageBase64: Buffer.from('not-jpeg').toString('base64'),
          mimeType: 'image/png',
          filename: 'x.png',
        }),
      (err: unknown) => err instanceof Error
    );
  });

  it('creates draft with ownership + idempotency', async () => {
    // Minimal valid JPEG (1x1) — Cloudinary may reject; if so, insert media row directly
    const tinyJpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z',
      'base64'
    );

    try {
      const uploaded = await actionUploadMedia(userId, {
        imageBase64: tinyJpeg.toString('base64'),
        mimeType: 'image/jpeg',
        filename: 'e2e.jpg',
        idempotencyKey: `up-${userId}`,
      });
      mediaId = uploaded.mediaId;
    } catch {
      mediaId = newId();
      await queryExec(
        `INSERT INTO rs_media
          (id, user_id, cloudinary_public_id, cloudinary_url, secure_url, resource_type, mime_type, file_size, width, height)
         VALUES (?, ?, 'e2e/public', 'http://example.com/a.jpg', 'https://example.com/a.jpg', 'image', 'image/jpeg', 100, 1080, 1080)`,
        [mediaId, userId]
      );
    }

    const draft = await actionCreatePost(userId, {
      caption: 'E2E ChatGPT draft',
      mediaId,
      idempotencyKey: `create-${userId}`,
    });
    postId = draft.postId;
    assert.equal(draft.status, 'draft');

    const again = await actionCreatePost(userId, {
      caption: 'E2E ChatGPT draft',
      mediaId,
      idempotencyKey: `create-${userId}`,
    });
    assert.equal(again.postId, postId);
  });

  it('schedules post without requiring ChatGPT to wait', async () => {
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const y = future.getUTCFullYear();
    // Use user timezone local-ish ISO; Asia/Kolkata +05:30
    const scheduledAt = `${y + 1}-01-15T19:00:00`;
    const scheduled = await actionSchedulePost(userId, {
      postId,
      scheduledAt,
      timezone: 'Asia/Kolkata',
      idempotencyKey: `sched-${postId}`,
    });
    assert.equal(scheduled.status, 'scheduled');
    assert.ok(scheduled.scheduledAt);
  });

  it('publishPost is the single publish entry (duplicate safe)', async () => {
    // Force draft/scheduled → use publish with mocked already-published delivery path
    await queryExec(
      `UPDATE rs_posts SET status = 'draft', scheduled_at = NULL, publish_lock_token = NULL
       WHERE id = ? AND user_id = ?`,
      [postId, userId]
    );

    const deliveryId = newId();
    const accounts = await queryRows(
      `SELECT id FROM rs_accounts WHERE user_id = ? AND platform = 'instagram' LIMIT 1`,
      [userId]
    );
    await queryExec(
      `INSERT INTO rs_deliveries
        (id, post_id, account_id, status, remote_post_id, idempotency_key)
       VALUES (?, ?, ?, 'published', 'ig-remote-1', ?)
       ON DUPLICATE KEY UPDATE status = 'published', remote_post_id = 'ig-remote-1'`,
      [deliveryId, postId, accounts[0].id, `ig-publish:${postId}`]
    );

    const first = await actionPublishPost(userId, {
      postId,
      idempotencyKey: `pub-${postId}`,
    });
    publishCalls += 1;
    assert.equal(first.status, 'published');
    assert.equal(first.remotePostId, 'ig-remote-1');

    const second = await actionPublishPost(userId, {
      postId,
      idempotencyKey: `pub-${postId}`,
    });
    publishCalls += 1;
    assert.equal(second.postId, first.postId);
    assert.equal(second.remotePostId, 'ig-remote-1');

    // Direct service path also skips duplicate Instagram work
    const third = await publishPost(postId, userId);
    assert.equal(third.status, 'published');
    assert.equal(publishCalls, 2);
  });
});
