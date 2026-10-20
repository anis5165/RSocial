import type { ConnectionOptions } from 'mysql2';
import { env, isProd } from '../config/env';

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function mysqlConnectionOptions(overrides: ConnectionOptions = {}): ConnectionOptions {
  const host = env.DATABASE_HOST;
  const local = isLocalHost(host);

  let ssl: ConnectionOptions['ssl'] | undefined;
  if (env.DATABASE_SSL === 'require' || (env.DATABASE_SSL === 'auto' && isProd && !local)) {
    ssl = { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED };
  }

  return {
    host,
    port: env.DATABASE_PORT,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    ssl,
    connectTimeout: env.DATABASE_CONNECT_TIMEOUT_MS,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    // Render + Hostinger: dual-stack DNS often yields AggregateError with an empty message.
    family: env.DATABASE_IP_FAMILY,
    timezone: 'Z',
    dateStrings: false,
    ...overrides,
  };
}

export function mysqlPoolMeta(): Record<string, unknown> {
  return {
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    database: env.DATABASE_NAME,
    user: env.DATABASE_USER,
    ssl: env.DATABASE_SSL,
    ipFamily: env.DATABASE_IP_FAMILY,
  };
}

function serializeOne(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) {
    return { message: String(err) };
  }
  const extra = err as Error & {
    code?: string;
    errno?: number;
    sqlState?: string;
    syscall?: string;
    address?: string;
    port?: number;
    fatal?: boolean;
    cause?: unknown;
    errors?: unknown[];
  };
  return {
    name: err.name,
    message: err.message || '(empty)',
    code: extra.code,
    errno: extra.errno,
    sqlState: extra.sqlState,
    syscall: extra.syscall,
    address: extra.address,
    port: extra.port,
    fatal: extra.fatal,
    cause: extra.cause ? serializeOne(extra.cause) : undefined,
    errors: Array.isArray(extra.errors) ? extra.errors.map(serializeOne) : undefined,
  };
}

export function formatMysqlError(err: unknown): Record<string, unknown> {
  return serializeOne(err);
}
