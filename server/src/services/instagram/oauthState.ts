import { DateTime } from 'luxon';
import { queryExec, queryRows } from '../../db/pool';
import { AppError } from '../../utils/errors';
import { newId } from '../../utils/ids';
import { randomToken } from '../../utils/crypto';
import { toMysqlUtc } from '../../utils/time';

const TTL_MINUTES = 10;

export async function createOAuthState(userId: string, provider: string): Promise<string> {
  const id = newId();
  const state = randomToken(32);
  const expiresAt = DateTime.utc().plus({ minutes: TTL_MINUTES }).toJSDate();

  await queryExec(
    `INSERT INTO rs_oauth_states (id, user_id, state, provider, expires_at, used)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [id, userId, state, provider, toMysqlUtc(expiresAt)]
  );

  return state;
}

/**
 * Atomically consume a single-use OAuth state. Returns associated userId.
 */
export async function consumeOAuthState(
  state: string,
  provider: string,
  expectedUserId?: string
): Promise<string> {
  const rows = await queryRows(
    `SELECT id, user_id, expires_at, used
     FROM rs_oauth_states
     WHERE state = ? AND provider = ?
     LIMIT 1`,
    [state, provider]
  );
  const row = rows[0];
  if (!row) {
    throw new AppError('INVALID_OAUTH_STATE', 'Invalid OAuth state.', 400);
  }
  if (expectedUserId && row.user_id !== expectedUserId) {
    throw new AppError('INVALID_OAUTH_STATE', 'OAuth state does not match user.', 400);
  }
  if (row.used) {
    throw new AppError('OAUTH_STATE_USED', 'OAuth state has already been used.', 400);
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new AppError('OAUTH_STATE_EXPIRED', 'OAuth state has expired.', 400);
  }

  const result = await queryExec(
    `UPDATE rs_oauth_states SET used = 1
     WHERE id = ? AND used = 0`,
    [row.id]
  );

  if (result.affectedRows === 0) {
    throw new AppError('OAUTH_STATE_USED', 'OAuth state could not be consumed.', 400);
  }

  return row.user_id as string;
}
