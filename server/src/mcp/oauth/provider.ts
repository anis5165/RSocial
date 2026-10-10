import type { Response } from 'express';
import { env } from '../../config/env';
import {
  InvalidRequestError,
  type AuthorizationParams,
  type AuthInfo,
  type OAuthClientInformationFull,
  type OAuthServerProvider,
  type OAuthTokens,
} from '../sdk';
import {
  MysqlClientsStore,
  consumeAuthCode,
  createPendingAuth,
  findAccessToken,
  findRefreshToken,
  getAuthCode,
  randomOpaqueToken,
  revokeToken as revokeStoredToken,
  storeTokenPair,
} from './store';

const ACCESS_TTL = 3600;
const REFRESH_TTL = 60 * 60 * 24 * 30;

export class RoutismOAuthProvider implements OAuthServerProvider {
  clientsStore = new MysqlClientsStore();

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    if (!client.redirect_uris.includes(params.redirectUri)) {
      throw new InvalidRequestError('Unregistered redirect_uri');
    }

    const pendingId = await createPendingAuth({
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      scopes: params.scopes,
      resource: params.resource?.toString(),
    });

    const loginUrl = new URL('/mcp/oauth/login', env.API_BASE_URL);
    loginUrl.searchParams.set('pending', pendingId);
    res.redirect(loginUrl.toString());
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const row = await getAuthCode(authorizationCode);
    if (!row) throw new Error('Invalid authorization code');
    return String(row.code_challenge);
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    _resource?: URL
  ): Promise<OAuthTokens> {
    const row = await getAuthCode(authorizationCode);
    if (!row) throw new Error('Invalid authorization code');
    if (row.client_id !== client.client_id) {
      throw new Error('Authorization code was not issued to this client');
    }
    if (redirectUri && row.redirect_uri !== redirectUri) {
      throw new Error('redirect_uri mismatch');
    }

    await consumeAuthCode(authorizationCode);

    const accessToken = randomOpaqueToken(32);
    const refreshToken = randomOpaqueToken(32);
    const scopes = String(row.scopes || 'mcp:tools');

    await storeTokenPair({
      accessToken,
      refreshToken,
      clientId: client.client_id,
      userId: String(row.user_id),
      scopes,
      resource: row.resource ? String(row.resource) : undefined,
      accessTtlSec: ACCESS_TTL,
      refreshTtlSec: REFRESH_TTL,
    });

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: ACCESS_TTL,
      refresh_token: refreshToken,
      scope: scopes,
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    _resource?: URL
  ): Promise<OAuthTokens> {
    const row = await findRefreshToken(refreshToken);
    if (!row) throw new Error('Invalid refresh token');
    if (row.client_id !== client.client_id) {
      throw new Error('Refresh token was not issued to this client');
    }

    await revokeStoredToken(refreshToken);

    const accessToken = randomOpaqueToken(32);
    const newRefresh = randomOpaqueToken(32);
    const scopeStr = scopes?.join(' ') || String(row.scopes || 'mcp:tools');

    await storeTokenPair({
      accessToken,
      refreshToken: newRefresh,
      clientId: client.client_id,
      userId: String(row.user_id),
      scopes: scopeStr,
      resource: row.resource ? String(row.resource) : undefined,
      accessTtlSec: ACCESS_TTL,
      refreshTtlSec: REFRESH_TTL,
    });

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: ACCESS_TTL,
      refresh_token: newRefresh,
      scope: scopeStr,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const row = await findAccessToken(token);
    if (!row) throw new Error('Invalid or expired token');

    return {
      token,
      clientId: String(row.client_id),
      scopes: String(row.scopes || 'mcp:tools')
        .split(' ')
        .filter(Boolean),
      expiresAt: Math.floor(new Date(row.expires_at as string | Date).getTime() / 1000),
      resource: row.resource ? new URL(String(row.resource)) : undefined,
      extra: {
        userId: String(row.user_id),
      },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: { token: string }
  ): Promise<void> {
    await revokeStoredToken(request.token);
  }
}
