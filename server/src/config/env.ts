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
  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().default(3306),
  DATABASE_NAME: z.string().min(1),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string().default(''),
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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
