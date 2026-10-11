/**
 * Fail production / Vercel builds when the API origin is missing.
 * Empty VITE_API_BASE_URL makes login POST to the Vercel host → 405.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readEnvFile(name) {
  const path = join(root, name);
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    out[key] = value;
  }
  return out;
}

const fromFile = {
  ...readEnvFile('.env'),
  ...readEnvFile('.env.production'),
  ...readEnvFile('.env.local'),
};

const url = (process.env.VITE_API_BASE_URL || fromFile.VITE_API_BASE_URL || '')
  .trim()
  .replace(/\/$/, '');
const isCi = Boolean(process.env.VERCEL || process.env.CI);

if (isCi && !url) {
  console.error(
    [
      'Missing VITE_API_BASE_URL for this build.',
      'Set it in apps/dashboard/.env.production or Vercel env:',
      '  VITE_API_BASE_URL=https://YOUR-SERVICE.onrender.com',
      '(no trailing slash), then Redeploy Production.',
    ].join('\n')
  );
  process.exit(1);
}

if (url && !/^https?:\/\//i.test(url)) {
  console.error('VITE_API_BASE_URL must be an absolute URL (https://...).');
  process.exit(1);
}

if (url) {
  console.log(`API base URL: ${url}`);
}
