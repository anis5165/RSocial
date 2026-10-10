import bcrypt from 'bcryptjs';
import { queryExec, queryRows } from '../../db/pool';
import { AppError } from '../../utils/errors';
import { newId } from '../../utils/ids';
import { env } from '../../config/env';
import { utcToIso } from '../../utils/time';
import type { AuthUser } from './session';

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  timezone?: string;
}): Promise<AuthUser> {
  const email = input.email.trim().toLowerCase();
  const existing = await queryRows(
    'SELECT id FROM rs_users WHERE email = ? LIMIT 1',
    [email]
  );
  if (existing[0]) {
    throw new AppError('EMAIL_EXISTS', 'An account with this email already exists.', 409);
  }

  const id = newId();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const timezone = input.timezone || env.DEFAULT_TIMEZONE;

  await queryExec(
    `INSERT INTO rs_users (id, email, password_hash, name, timezone)
     VALUES (?, ?, ?, ?, ?)`,
    [id, email, passwordHash, input.name.trim(), timezone]
  );

  return {
    id,
    email,
    name: input.name.trim(),
    timezone,
    createdAt: new Date().toISOString(),
  };
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const rows = await queryRows(
    'SELECT id, email, name, timezone, password_hash, created_at FROM rs_users WHERE email = ? LIMIT 1',
    [email.trim().toLowerCase()]
  );
  const row = rows[0];
  if (!row) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
  }

  const ok = await bcrypt.compare(password, row.password_hash as string);
  if (!ok) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    timezone: row.timezone,
    createdAt: utcToIso(row.created_at) ?? new Date().toISOString(),
  };
}

export async function updateUserSettings(
  userId: string,
  input: { name?: string; timezone?: string }
): Promise<AuthUser> {
  const rows = await queryRows(
    'SELECT id, email, name, timezone, created_at FROM rs_users WHERE id = ? LIMIT 1',
    [userId]
  );
  const row = rows[0];
  if (!row) throw new AppError('USER_NOT_FOUND', 'User not found.', 404);

  const name = input.name?.trim() || row.name;
  const timezone = input.timezone || row.timezone;

  await queryExec('UPDATE rs_users SET name = ?, timezone = ? WHERE id = ?', [
    name,
    timezone,
    userId,
  ]);

  return {
    id: row.id,
    email: row.email,
    name,
    timezone,
    createdAt: utcToIso(row.created_at) ?? new Date().toISOString(),
  };
}
