import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load monorepo root .env, then local overrides
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  APP_BASE_URL: z.string().url(),
  API_BASE_URL: z.string().url(),
  DATABASE_HOST: z.string().trim().min(1),
  DATABASE_PORT: z.coerce.number().default(3306),
  DATABASE_NAME: z.string().trim().min(1),
  DATABASE_USER: z.string().trim().min(1),
  DATABASE_PASSWORD: z.string().default(''),
  /** auto = SSL in production for remote hosts; require/disable to force. */
  DATABASE_SSL: z.enum(['auto', 'require', 'disable']).default('disable'),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
  /** 4 = IPv4 only (recommended on Render). 0 = dual-stack. */
  DATABASE_IP_FAMILY: z.coerce.number().default(4),
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().default(15000),
  /** When set with DATABASE_SSH_USER, MySQL is reached via SSH (Hostinger + Render). */
  DATABASE_SSH_HOST: z.string().optional().default(''),
  DATABASE_SSH_PORT: z.coerce.number().default(22),
  DATABASE_SSH_USER: z.string().optional().default(''),
  DATABASE_SSH_PASSWORD: z.string().optional().default(''),
  DATABASE_SSH_PRIVATE_KEY: z.string().optional().default(''),
  DATABASE_SSH_DEST_HOST: z.string().optional().default('127.0.0.1'),
  JWT_SECRET: z.string().min(16),
  SESSION_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(32),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default('dyb3jipsi'),
  CLOUDINARY_UPLOAD_PRESET: z.string().optional().default('cooking'),
  INSTAGRAM_CLIENT_ID: z.string().optional().default(''),
  INSTAGRAM_CLIENT_SECRET: z.string().optional().default(''),
  INSTAGRAM_REDIRECT_URI: z.string().optional().default(''),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'),
  /** unset = on in production only; "true"/"false" to force. */
  KEEP_ALIVE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  KEEP_ALIVE_INTERVAL_MS: z.coerce.number().default(5 * 60 * 1000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
