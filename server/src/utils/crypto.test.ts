import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Ensure ENCRYPTION_KEY exists before importing module under test
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-123456';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-123456';
process.env.APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';
process.env.API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
process.env.DATABASE_HOST = process.env.DATABASE_HOST || '127.0.0.1';
process.env.DATABASE_NAME = process.env.DATABASE_NAME || 'routism_social';
process.env.DATABASE_USER = process.env.DATABASE_USER || 'root';

describe('token encryption', () => {
  it('round-trips AES-256-GCM payloads', async () => {
    const { encryptToken, decryptToken } = await import('./crypto');
    const plain = 'EAATestTokenValue123';
    const enc = encryptToken(plain);
    assert.notEqual(enc, plain);
    assert.equal(decryptToken(enc), plain);
  });
});
