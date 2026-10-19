import { queryExec, queryRows } from '../../../db/pool';
import { newId } from '../../../utils/ids';
import { toMysqlUtc } from '../../../utils/time';
import { AppError } from '../../../utils/errors';

export async function upsertChatgptConnection(input: {
  userId: string;
  clientId: string;
  scopes: string;
  externalSubject?: string | null;
}) {
  const existing = await queryRows(
    `SELECT * FROM rs_chatgpt_connections
     WHERE user_id = ? AND client_id = ? AND status = 'active'
     LIMIT 1`,
    [input.userId, input.clientId]
  );

  if (existing[0]) {
    await queryExec(
      `UPDATE rs_chatgpt_connections
       SET scopes = ?, external_subject = COALESCE(?, external_subject),
           last_used_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [input.scopes, input.externalSubject || null, existing[0].id]
    );
    return String(existing[0].id);
  }

  const id = newId();
  await queryExec(
    `INSERT INTO rs_chatgpt_connections
      (id, user_id, provider, client_id, external_subject, scopes, status, last_used_at)
     VALUES (?, ?, 'chatgpt', ?, ?, ?, 'active', UTC_TIMESTAMP(3))`,
    [id, input.userId, input.clientId, input.externalSubject || null, input.scopes]
  );
  return id;
}

export async function touchChatgptConnection(userId: string, clientId: string) {
  await queryExec(
    `UPDATE rs_chatgpt_connections
     SET last_used_at = UTC_TIMESTAMP(3)
     WHERE user_id = ? AND client_id = ? AND status = 'active'`,
    [userId, clientId]
  );
}

export async function assertActiveChatgptConnection(userId: string, clientId: string) {
  const rows = await queryRows(
    `SELECT id FROM rs_chatgpt_connections
     WHERE user_id = ? AND client_id = ? AND status = 'active'
       AND (revoked_at IS NULL OR revoked_at > UTC_TIMESTAMP(3))
     LIMIT 1`,
    [userId, clientId]
  );
  if (!rows[0]) {
    throw new AppError(
      'CHATGPT_CONNECTION_REVOKED',
      'ChatGPT connection is missing or revoked. Reconnect Routism Social in ChatGPT.',
      401
    );
  }
}

export async function revokeChatgptConnection(userId: string, clientId?: string) {
  if (clientId) {
    await queryExec(
      `UPDATE rs_chatgpt_connections
       SET status = 'revoked', revoked_at = ?
       WHERE user_id = ? AND client_id = ? AND status = 'active'`,
      [toMysqlUtc(new Date()), userId, clientId]
    );
  } else {
    await queryExec(
      `UPDATE rs_chatgpt_connections
       SET status = 'revoked', revoked_at = ?
       WHERE user_id = ? AND status = 'active'`,
      [toMysqlUtc(new Date()), userId]
    );
  }
}
