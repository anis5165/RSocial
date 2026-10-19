import crypto from 'crypto';
import { queryExec, queryRows } from '../../db/pool';
import { AppError } from '../../utils/errors';
import { newId } from '../../utils/ids';
import { toMysqlUtc } from '../../utils/time';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function hashRequestPayload(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex');
}

/**
 * Run a write operation once per (user, key, operation).
 * Retries with the same key + identical body return the cached response.
 * Same key + different body → IDEMPOTENCY_CONFLICT.
 */
export async function withIdempotency<T>(opts: {
  userId: string;
  key: string | undefined | null;
  operation: string;
  request: unknown;
  ttlMs?: number;
  execute: () => Promise<T>;
}): Promise<T> {
  const key = (opts.key || '').trim();
  if (!key) {
    return opts.execute();
  }
  if (key.length > 128) {
    throw new AppError('VALIDATION_ERROR', 'Idempotency-Key must be 128 characters or fewer.', 400);
  }

  const requestHash = hashRequestPayload(opts.request);
  const existing = await queryRows(
    `SELECT * FROM rs_idempotency_keys
     WHERE user_id = ? AND idempotency_key = ? AND operation = ?
       AND expires_at > UTC_TIMESTAMP(3)
     LIMIT 1`,
    [opts.userId, key, opts.operation]
  );

  if (existing[0]) {
    if (existing[0].request_hash !== requestHash) {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency-Key was reused with a different request body.',
        409
      );
    }
    return JSON.parse(String(existing[0].response_json)) as T;
  }

  const result = await opts.execute();
  const expires = new Date(Date.now() + (opts.ttlMs ?? DEFAULT_TTL_MS));

  try {
    await queryExec(
      `INSERT INTO rs_idempotency_keys
        (id, user_id, idempotency_key, operation, request_hash, response_json, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)`,
      [
        newId(),
        opts.userId,
        key,
        opts.operation,
        requestHash,
        JSON.stringify(result),
        toMysqlUtc(expires),
      ]
    );
  } catch {
    // Concurrent insert: return the winner's cached response if body matches
    const raced = await queryRows(
      `SELECT * FROM rs_idempotency_keys
       WHERE user_id = ? AND idempotency_key = ? AND operation = ?
       LIMIT 1`,
      [opts.userId, key, opts.operation]
    );
    if (raced[0]) {
      if (raced[0].request_hash !== requestHash) {
        throw new AppError(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency-Key was reused with a different request body.',
          409
        );
      }
      return JSON.parse(String(raced[0].response_json)) as T;
    }
  }

  return result;
}
