type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const SENSITIVE = [
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'encryption',
  'access_token',
  'refresh_token',
  'client_secret',
  'api_secret',
];

function sanitize(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    // Never log long opaque strings that might be tokens
    if (value.length > 200) return `[redacted:${value.length}chars]`;
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE.some((s) => k.toLowerCase().includes(s))) {
        out[k] = '[redacted]';
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
  }
  return value;
}

function write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta: sanitize(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
};
