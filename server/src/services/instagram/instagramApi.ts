import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';

const GRAPH = 'https://graph.facebook.com/v21.0';
const OAUTH = 'https://www.facebook.com/v21.0/dialog/oauth';

export function isInstagramConfigured(): boolean {
  return Boolean(
    env.INSTAGRAM_CLIENT_ID &&
      env.INSTAGRAM_CLIENT_SECRET &&
      env.INSTAGRAM_REDIRECT_URI
  );
}

export function buildAuthorizationUrl(state: string): string {
  if (!isInstagramConfigured()) {
    throw new AppError(
      'INSTAGRAM_NOT_CONFIGURED',
      'Instagram OAuth is not configured on the server.',
      503
    );
  }
  const params = new URLSearchParams({
    client_id: env.INSTAGRAM_CLIENT_ID,
    redirect_uri: env.INSTAGRAM_REDIRECT_URI,
    state,
    response_type: 'code',
    scope: [
      'instagram_basic',
      'instagram_content_publish',
      'pages_show_list',
      'pages_read_engagement',
      'business_management',
    ].join(','),
  });
  return `${OAUTH}?${params.toString()}`;
}

async function graphGet<T>(path: string, accessToken: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', accessToken);

  const res = await fetch(url.toString());
  const data = (await res.json()) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || (data as { error?: unknown }).error) {
    const msg = (data as { error?: { message?: string } }).error?.message || 'Instagram API request failed.';
    logger.warn('instagram_api_error', { path, status: res.status, message: msg });
    throw new AppError('INSTAGRAM_API_ERROR', msg, 502);
  }
  return data;
}

async function graphPost<T>(
  path: string,
  accessToken: string,
  body: Record<string, string>
): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  url.searchParams.set('access_token', accessToken);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok || (data as { error?: unknown }).error) {
    const msg = (data as { error?: { message?: string } }).error?.message || 'Instagram API request failed.';
    logger.warn('instagram_api_error', { path, status: res.status, message: msg });
    throw new AppError('INSTAGRAM_API_ERROR', msg, 502);
  }
  return data;
}

export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  expiresIn: number | null;
}> {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set('client_id', env.INSTAGRAM_CLIENT_ID);
  url.searchParams.set('client_secret', env.INSTAGRAM_CLIENT_SECRET);
  url.searchParams.set('redirect_uri', env.INSTAGRAM_REDIRECT_URI);
  url.searchParams.set('code', code);

  const res = await fetch(url.toString(), { method: 'GET' });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !data.access_token) {
    throw new AppError(
      'OAUTH_TOKEN_EXCHANGE_FAILED',
      data.error?.message || 'Failed to exchange OAuth code.',
      502
    );
  }

  // Exchange for long-lived user token
  const longUrl = new URL(`${GRAPH}/oauth/access_token`);
  longUrl.searchParams.set('grant_type', 'fb_exchange_token');
  longUrl.searchParams.set('client_id', env.INSTAGRAM_CLIENT_ID);
  longUrl.searchParams.set('client_secret', env.INSTAGRAM_CLIENT_SECRET);
  longUrl.searchParams.set('fb_exchange_token', data.access_token);

  const longRes = await fetch(longUrl.toString());
  const longData = (await longRes.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: longData.access_token || data.access_token,
    expiresIn: longData.expires_in ?? data.expires_in ?? null,
  };
}

export async function refreshLongLivedToken(currentToken: string): Promise<{
  accessToken: string;
  expiresIn: number | null;
}> {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', env.INSTAGRAM_CLIENT_ID);
  url.searchParams.set('client_secret', env.INSTAGRAM_CLIENT_SECRET);
  url.searchParams.set('fb_exchange_token', currentToken);

  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !data.access_token) {
    throw new AppError(
      'TOKEN_REFRESH_FAILED',
      data.error?.message || 'Failed to refresh Instagram token.',
      502
    );
  }
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? null,
  };
}

export interface IgAccountInfo {
  pageId: string;
  pageName: string;
  igUserId: string;
  username: string;
  pageAccessToken: string;
}

/**
 * Resolve Instagram Business/Creator account linked to a Facebook Page.
 */
export async function resolveInstagramAccount(userAccessToken: string): Promise<IgAccountInfo> {
  const pages = await graphGet<{
    data: Array<{ id: string; name: string; access_token: string }>;
  }>('/me/accounts', userAccessToken, {
    fields: 'id,name,access_token',
  });

  if (!pages.data?.length) {
    throw new AppError(
      'NO_FACEBOOK_PAGES',
      'No Facebook Pages found. Connect a Page linked to an Instagram professional account.',
      400
    );
  }

  for (const page of pages.data) {
    try {
      const pageData = await graphGet<{
        instagram_business_account?: { id: string; username?: string };
      }>(`/${page.id}`, page.access_token, {
        fields: 'instagram_business_account{id,username}',
      });
      const ig = pageData.instagram_business_account;
      if (ig?.id) {
        const igUser = await graphGet<{ id: string; username?: string }>(
          `/${ig.id}`,
          page.access_token,
          { fields: 'id,username' }
        );
        return {
          pageId: page.id,
          pageName: page.name,
          igUserId: igUser.id,
          username: igUser.username || ig.username || page.name,
          pageAccessToken: page.access_token,
        };
      }
    } catch {
      // try next page
    }
  }

  throw new AppError(
    'NO_INSTAGRAM_BUSINESS',
    'No Instagram professional account linked to your Facebook Pages was found.',
    400
  );
}

export async function createImageContainer(params: {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption: string;
}): Promise<string> {
  const result = await graphPost<{ id: string }>(
    `/${params.igUserId}/media`,
    params.accessToken,
    {
      image_url: params.imageUrl,
      caption: params.caption,
    }
  );
  if (!result.id) {
    throw new AppError('CONTAINER_CREATE_FAILED', 'Failed to create Instagram media container.', 502);
  }
  return result.id;
}

export async function waitForContainerReady(params: {
  containerId: string;
  accessToken: string;
  maxAttempts?: number;
}): Promise<void> {
  const max = params.maxAttempts ?? 20;
  for (let i = 0; i < max; i++) {
    const status = await graphGet<{ status_code?: string; status?: string }>(
      `/${params.containerId}`,
      params.accessToken,
      { fields: 'status_code,status' }
    );
    const code = status.status_code || status.status;
    if (code === 'FINISHED' || code === 'PUBLISHED') return;
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new AppError('CONTAINER_FAILED', 'Instagram media container processing failed.', 502);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new AppError('CONTAINER_TIMEOUT', 'Timed out waiting for Instagram media container.', 504);
}

export async function publishContainer(params: {
  igUserId: string;
  accessToken: string;
  creationId: string;
}): Promise<string> {
  const result = await graphPost<{ id: string }>(
    `/${params.igUserId}/media_publish`,
    params.accessToken,
    { creation_id: params.creationId }
  );
  if (!result.id) {
    throw new AppError('PUBLISH_FAILED', 'Failed to publish Instagram media.', 502);
  }
  return result.id;
}
