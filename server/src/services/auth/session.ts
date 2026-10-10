import crypto from 'crypto';
import { Request, Response } from 'express';
import { env, isProd } from '../../config/env';
import { queryRows } from '../../db/pool';
import { utcToIso } from '../../utils/time';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
  createdAt: string;
}

const COOKIE_NAME = 'routism_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface SessionPayload {
  sub: string;
  exp: number;
  iat: number;
}

function sign(payloadB64: string): string {
  return crypto.createHmac('sha256', env.SESSION_SECRET).update(payloadB64).digest('base64url');
}

function encodeSession(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: userId,
    iat: now,
    exp: now + Math.floor(MAX_AGE_MS / 1000),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

function decodeSession(token: string): SessionPayload | null {
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as SessionPayload;
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, userId: string) {
  const token = encodeSession(userId);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE || isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE || isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  });
}

export async function getSessionUser(req: Request): Promise<AuthUser | null> {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) return null;
  const payload = decodeSession(token);
  if (!payload) return null;

  const rows = await queryRows(
    'SELECT id, email, name, timezone, created_at FROM rs_users WHERE id = ? LIMIT 1',
    [payload.sub]
  );
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    timezone: row.timezone,
    createdAt: utcToIso(row.created_at) ?? new Date().toISOString(),
  };
}
