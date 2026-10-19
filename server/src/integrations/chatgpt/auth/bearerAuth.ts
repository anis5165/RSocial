import { Request, Response, NextFunction } from 'express';
import { findAccessToken } from '../../../mcp/oauth/store';
import { queryRows } from '../../../db/pool';
import { utcToIso } from '../../../utils/time';
import { AppError } from '../../../utils/errors';
import {
  assertActiveChatgptConnection,
  touchChatgptConnection,
  upsertChatgptConnection,
} from './connectionService';

const CHATGPT_SCOPE = 'chatgpt:actions';

export async function requireChatgptBearer(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      throw new AppError('AUTH_REQUIRED', 'Bearer access token required.', 401);
    }

    const row = await findAccessToken(match[1].trim());
    if (!row) {
      throw new AppError('AUTH_REQUIRED', 'Invalid or expired access token.', 401);
    }

    const scopes = String(row.scopes || '')
      .split(/[\s,]+/)
      .filter(Boolean);
    const allowed = scopes.includes(CHATGPT_SCOPE) || scopes.includes('mcp:tools');
    if (!allowed) {
      throw new AppError('AUTH_REQUIRED', 'Token missing chatgpt:actions scope.', 401);
    }

    const userId = String(row.user_id);
    const clientId = String(row.client_id);

    // Ensure a connection row exists; reject only if explicitly revoked
    const revoked = await queryRows(
      `SELECT id FROM rs_chatgpt_connections
       WHERE user_id = ? AND client_id = ? AND status = 'revoked'
       LIMIT 1`,
      [userId, clientId]
    );
    if (revoked[0]) {
      throw new AppError(
        'CHATGPT_CONNECTION_REVOKED',
        'ChatGPT connection was revoked. Reconnect Routism Social in ChatGPT.',
        401
      );
    }

    await upsertChatgptConnection({
      userId,
      clientId,
      scopes: scopes.includes(CHATGPT_SCOPE) ? CHATGPT_SCOPE : scopes.join(' '),
    });
    await assertActiveChatgptConnection(userId, clientId);
    await touchChatgptConnection(userId, clientId);

    const users = await queryRows(
      'SELECT id, email, name, timezone, created_at FROM rs_users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (!users[0]) {
      throw new AppError('AUTH_REQUIRED', 'User not found for this token.', 401);
    }

    req.user = {
      id: users[0].id,
      email: users[0].email,
      name: users[0].name,
      timezone: users[0].timezone,
      createdAt: utcToIso(users[0].created_at) ?? new Date().toISOString(),
    };

    next();
  } catch (err) {
    next(err);
  }
}
