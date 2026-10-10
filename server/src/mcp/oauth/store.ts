import crypto from 'crypto';
import { queryExec, queryRows } from '../../db/pool';
import { newId } from '../../utils/ids';
import { toMysqlUtc } from '../../utils/time';
import type { OAuthClientInformationFull, OAuthRegisteredClientsStore } from '../sdk';

export function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rowToClient(row: Record<string, unknown>): OAuthClientInformationFull {
  return {
    client_id: String(row.client_id),
    client_secret: undefined,
    client_id_issued_at: Number(row.client_id_issued_at),
    client_secret_expires_at: Number(row.client_secret_expires_at || 0),
    redirect_uris: parseJsonArray(row.redirect_uris),
    grant_types: parseJsonArray(row.grant_types),
    response_types: parseJsonArray(row.response_types),
    token_endpoint_auth_method: String(row.token_endpoint_auth_method || 'none'),
    client_name: row.client_name ? String(row.client_name) : undefined,
    scope: row.scope ? String(row.scope) : undefined,
  };
}

export class MysqlClientsStore implements OAuthRegisteredClientsStore {
  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const rows = await queryRows(
      'SELECT * FROM rs_mcp_clients WHERE client_id = ? LIMIT 1',
      [clientId]
    );
    if (!rows[0]) return undefined;
    return rowToClient(rows[0]);
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>
  ): Promise<OAuthClientInformationFull> {
    const clientId = randomOpaqueToken(16);
    const issuedAt = Math.floor(Date.now() / 1000);
    const grantTypes = client.grant_types?.length
      ? client.grant_types
      : ['authorization_code', 'refresh_token'];
    const responseTypes = client.response_types?.length ? client.response_types : ['code'];
    const authMethod = client.token_endpoint_auth_method || 'none';

    await queryExec(
      `INSERT INTO rs_mcp_clients
        (client_id, client_secret_hash, client_name, redirect_uris, grant_types, response_types,
         token_endpoint_auth_method, scope, client_id_issued_at, client_secret_expires_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        clientId,
        client.client_name || null,
        JSON.stringify(client.redirect_uris),
        JSON.stringify(grantTypes),
        JSON.stringify(responseTypes),
        authMethod,
        client.scope || 'mcp:tools',
        issuedAt,
      ]
    );

    return {
      ...client,
      client_id: clientId,
      client_id_issued_at: issuedAt,
      client_secret_expires_at: 0,
      grant_types: grantTypes,
      response_types: responseTypes,
      token_endpoint_auth_method: authMethod,
      scope: client.scope || 'mcp:tools',
    };
  }
}

export async function createPendingAuth(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scopes?: string[];
  resource?: string;
}): Promise<string> {
  const id = newId();
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await queryExec(
    `INSERT INTO rs_mcp_pending_auth
      (id, client_id, redirect_uri, code_challenge, code_challenge_method, state, scopes, resource, expires_at)
     VALUES (?, ?, ?, ?, 'S256', ?, ?, ?, ?)`,
    [
      id,
      input.clientId,
      input.redirectUri,
      input.codeChallenge,
      input.state || null,
      input.scopes?.join(' ') || 'mcp:tools',
      input.resource || null,
      toMysqlUtc(expires),
    ]
  );
  return id;
}

export async function getPendingAuth(id: string) {
  const rows = await queryRows(
    `SELECT * FROM rs_mcp_pending_auth
     WHERE id = ? AND expires_at > UTC_TIMESTAMP(3) LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function deletePendingAuth(id: string) {
  await queryExec('DELETE FROM rs_mcp_pending_auth WHERE id = ?', [id]);
}

export async function issueAuthCode(input: {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes?: string;
  resource?: string;
}): Promise<string> {
  const code = randomOpaqueToken(32);
  const expires = new Date(Date.now() + 5 * 60 * 1000);
  await queryExec(
    `INSERT INTO rs_mcp_auth_codes
      (code_hash, client_id, user_id, redirect_uri, code_challenge, scopes, resource, expires_at, used)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      hashToken(code),
      input.clientId,
      input.userId,
      input.redirectUri,
      input.codeChallenge,
      input.scopes || 'mcp:tools',
      input.resource || null,
      toMysqlUtc(expires),
    ]
  );
  return code;
}

export async function getAuthCode(code: string) {
  const rows = await queryRows(
    `SELECT * FROM rs_mcp_auth_codes
     WHERE code_hash = ? AND used = 0 AND expires_at > UTC_TIMESTAMP(3)
     LIMIT 1`,
    [hashToken(code)]
  );
  return rows[0] || null;
}

export async function consumeAuthCode(code: string) {
  await queryExec('UPDATE rs_mcp_auth_codes SET used = 1 WHERE code_hash = ?', [
    hashToken(code),
  ]);
}

export async function storeTokenPair(input: {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  userId: string;
  scopes: string;
  resource?: string;
  accessTtlSec: number;
  refreshTtlSec: number;
}) {
  const accessExpires = new Date(Date.now() + input.accessTtlSec * 1000);
  const refreshExpires = new Date(Date.now() + input.refreshTtlSec * 1000);

  await queryExec(
    `INSERT INTO rs_mcp_tokens
      (token_hash, token_type, client_id, user_id, scopes, resource, refresh_token_hash, expires_at, revoked)
     VALUES (?, 'access', ?, ?, ?, ?, ?, ?, 0)`,
    [
      hashToken(input.accessToken),
      input.clientId,
      input.userId,
      input.scopes,
      input.resource || null,
      hashToken(input.refreshToken),
      toMysqlUtc(accessExpires),
    ]
  );

  await queryExec(
    `INSERT INTO rs_mcp_tokens
      (token_hash, token_type, client_id, user_id, scopes, resource, refresh_token_hash, expires_at, revoked)
     VALUES (?, 'refresh', ?, ?, ?, ?, NULL, ?, 0)`,
    [
      hashToken(input.refreshToken),
      input.clientId,
      input.userId,
      input.scopes,
      input.resource || null,
      toMysqlUtc(refreshExpires),
    ]
  );
}

export async function findAccessToken(token: string) {
  const rows = await queryRows(
    `SELECT * FROM rs_mcp_tokens
     WHERE token_hash = ? AND token_type = 'access' AND revoked = 0
       AND expires_at > UTC_TIMESTAMP(3)
     LIMIT 1`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

export async function findRefreshToken(token: string) {
  const rows = await queryRows(
    `SELECT * FROM rs_mcp_tokens
     WHERE token_hash = ? AND token_type = 'refresh' AND revoked = 0
       AND expires_at > UTC_TIMESTAMP(3)
     LIMIT 1`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

export async function revokeToken(token: string) {
  const h = hashToken(token);
  await queryExec(
    'UPDATE rs_mcp_tokens SET revoked = 1 WHERE token_hash = ? OR refresh_token_hash = ?',
    [h, h]
  );
}

/** Mint a personal access token for local MCP inspector testing. */
export async function mintPersonalAccessToken(userId: string, ttlSec = 86400 * 7) {
  const accessToken = randomOpaqueToken(32);
  const refreshToken = randomOpaqueToken(32);
  await storeTokenPair({
    accessToken,
    refreshToken,
    clientId: 'routism-cli',
    userId,
    scopes: 'mcp:tools',
    accessTtlSec: ttlSec,
    refreshTtlSec: ttlSec * 4,
  });
  return { accessToken, refreshToken, expiresIn: ttlSec };
}
