import { env, isProd } from '../../config/env';
import { logger } from '../../utils/logger';

let started = false;

function keepAliveEnabled(): boolean {
  if (env.KEEP_ALIVE === false) return false;
  if (env.KEEP_ALIVE === true) return true;
  return isProd;
}

function healthUrl(): string {
  return `${env.API_BASE_URL.replace(/\/$/, '')}/api/health`;
}

async function ping(): Promise<void> {
  const url = healthUrl();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ac.signal,
      headers: { 'user-agent': 'routism-keepalive' },
      redirect: 'manual',
    });
    if (!res.ok) {
      logger.warn('keepalive_non_ok', { url, status: res.status });
    }
  } catch (err) {
    logger.warn('keepalive_failed', {
      url,
      message: err instanceof Error ? err.message : 'unknown',
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hits the public health URL on a timer so Render inbound traffic
 * resets the free-tier idle clock. This cannot start a service that
 * is already spun down — only an external HTTP request can do that.
 */
export function startKeepAlive(): void {
  if (started || !keepAliveEnabled()) return;
  started = true;

  const url = healthUrl();
  const intervalMs = env.KEEP_ALIVE_INTERVAL_MS;

  setInterval(() => {
    void ping();
  }, intervalMs);

  logger.info('keepalive_started', { url, intervalMs });
}
