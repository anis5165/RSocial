import { DateTime } from 'luxon';
import { RowDataPacket } from 'mysql2';
import type { AccountPublic } from '@routism/shared';
import { queryExec, queryRows } from '../../db/pool';
import { AppError } from '../../utils/errors';
import { newId } from '../../utils/ids';
import { encryptToken, decryptToken } from '../../utils/crypto';
import { toMysqlUtc, utcToIso } from '../../utils/time';
import { logger } from '../../utils/logger';
import { createOAuthState, consumeOAuthState } from '../instagram/oauthState';
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  refreshLongLivedToken,
  resolveInstagramAccount,
  isInstagramConfigured,
} from '../instagram/instagramApi';
import { env } from '../../config/env';

function mapAccount(row: RowDataPacket): AccountPublic {
  return {
    id: row.id,
    platform: row.platform,
    platformAccountId: row.platform_account_id,
    username: row.username,
    displayName: row.display_name,
    status: row.status,
    tokenExpiresAt: utcToIso(row.token_expires_at),
    createdAt: utcToIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: utcToIso(row.updated_at) ?? new Date().toISOString(),
  };
}

/** MCP-compatible: listConnectedAccounts(userId) */
export async function listConnectedAccounts(userId: string): Promise<AccountPublic[]> {
  const rows = await queryRows(
    `SELECT id, user_id, platform, platform_account_id, username, display_name,
            token_expires_at, status, created_at, updated_at
     FROM rs_accounts
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map(mapAccount);
}

export async function getAccountById(accountId: string, userId: string): Promise<AccountPublic> {
  const rows = await queryRows(
    `SELECT id, user_id, platform, platform_account_id, username, display_name,
            token_expires_at, status, created_at, updated_at
     FROM rs_accounts WHERE id = ? AND user_id = ? LIMIT 1`,
    [accountId, userId]
  );
  if (!rows[0]) throw new AppError('ACCOUNT_NOT_FOUND', 'Account not found.', 404);
  return mapAccount(rows[0]);
}

export async function getInstagramAccountForUser(userId: string): Promise<RowDataPacket | null> {
  const rows = await queryRows(
    `SELECT * FROM rs_accounts
     WHERE user_id = ? AND platform = 'instagram' AND status = 'connected'
     ORDER BY updated_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

export async function startInstagramConnect(userId: string): Promise<string> {
  if (!isInstagramConfigured()) {
    throw new AppError(
      'INSTAGRAM_NOT_CONFIGURED',
      'Instagram OAuth is not configured on the server.',
      503
    );
  }
  const state = await createOAuthState(userId, 'instagram');
  return buildAuthorizationUrl(state);
}

export async function handleInstagramCallback(params: {
  code: string;
  state: string;
  sessionUserId?: string;
}): Promise<AccountPublic> {
  const userId = await consumeOAuthState(params.state, 'instagram', params.sessionUserId);

  const token = await exchangeCodeForToken(params.code);
  const ig = await resolveInstagramAccount(token.accessToken);

  const expiresAt = token.expiresIn
    ? DateTime.utc().plus({ seconds: token.expiresIn }).toJSDate()
    : DateTime.utc().plus({ days: 60 }).toJSDate();

  const encrypted = encryptToken(ig.pageAccessToken);

  const existing = await queryRows(
    `SELECT id FROM rs_accounts
     WHERE user_id = ? AND platform = 'instagram' AND platform_account_id = ?
     LIMIT 1`,
    [userId, ig.igUserId]
  );

  let accountId: string;
  if (existing[0]) {
    accountId = existing[0].id;
    await queryExec(
      `UPDATE rs_accounts
       SET username = ?, display_name = ?, encrypted_access_token = ?,
           token_expires_at = ?, status = 'connected', refresh_token = NULL
       WHERE id = ? AND user_id = ?`,
      [ig.username, ig.pageName, encrypted, toMysqlUtc(expiresAt), accountId, userId]
    );
  } else {
    await queryExec(
      `UPDATE rs_accounts SET status = 'disconnected'
       WHERE user_id = ? AND platform = 'instagram' AND status = 'connected'`,
      [userId]
    );
    accountId = newId();
    await queryExec(
      `INSERT INTO rs_accounts
        (id, user_id, platform, platform_account_id, username, display_name,
         encrypted_access_token, refresh_token, token_expires_at, status)
       VALUES (?, ?, 'instagram', ?, ?, ?, ?, NULL, ?, 'connected')`,
      [
        accountId,
        userId,
        ig.igUserId,
        ig.username,
        ig.pageName,
        encrypted,
        toMysqlUtc(expiresAt),
      ]
    );
  }

  logger.info('instagram_connected', { userId, accountId });
  return getAccountById(accountId, userId);
}

export async function disconnectAccount(accountId: string, userId: string): Promise<void> {
  const result = await queryExec(
    `UPDATE rs_accounts SET status = 'disconnected', encrypted_access_token = ?
     WHERE id = ? AND user_id = ?`,
    [encryptToken('disconnected'), accountId, userId]
  );
  if (result.affectedRows === 0) {
    throw new AppError('ACCOUNT_NOT_FOUND', 'Account not found.', 404);
  }
}

/**
 * Ensure token is valid; renew if near expiry. Returns decrypted access token.
 * Never logs or returns token to callers outside publishing.
 */
export async function getValidInstagramAccessToken(
  userId: string
): Promise<{ account: RowDataPacket; accessToken: string }> {
  const account = await getInstagramAccountForUser(userId);
  if (!account) {
    throw new AppError('INSTAGRAM_NOT_CONNECTED', 'No connected Instagram account.', 400);
  }

  let accessToken = decryptToken(account.encrypted_access_token);
  const expiresAt = account.token_expires_at
    ? new Date(account.token_expires_at).getTime()
    : null;

  const renewThresholdMs = 7 * 24 * 60 * 60 * 1000;
  if (expiresAt && expiresAt - Date.now() < renewThresholdMs) {
    try {
      const refreshed = await refreshLongLivedToken(accessToken);
      accessToken = refreshed.accessToken;
      const newExpiry = refreshed.expiresIn
        ? DateTime.utc().plus({ seconds: refreshed.expiresIn }).toJSDate()
        : DateTime.utc().plus({ days: 60 }).toJSDate();
      await queryExec(
        `UPDATE rs_accounts
         SET encrypted_access_token = ?, token_expires_at = ?, status = 'connected'
         WHERE id = ? AND user_id = ?`,
        [encryptToken(accessToken), toMysqlUtc(newExpiry), account.id, userId]
      );
      logger.info('instagram_token_refreshed', { userId, accountId: account.id });
    } catch {
      logger.warn('instagram_token_refresh_failed', { userId, accountId: account.id });
      if (expiresAt && expiresAt < Date.now()) {
        await queryExec(
          `UPDATE rs_accounts SET status = 'expired' WHERE id = ? AND user_id = ?`,
          [account.id, userId]
        );
        throw new AppError(
          'INSTAGRAM_TOKEN_EXPIRED',
          'Instagram token expired. Please reconnect.',
          401
        );
      }
    }
  }

  return { account, accessToken };
}

export function getInstagramConfigStatus() {
  return {
    configured: isInstagramConfigured(),
    redirectUri: env.INSTAGRAM_REDIRECT_URI || null,
  };
}
