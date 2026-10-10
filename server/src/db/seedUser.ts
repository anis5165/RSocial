import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { pool, queryExec, queryRows } from './pool';
import { newId } from '../utils/ids';

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

async function seedUser() {
  const email = (arg('email', process.env.SEED_USER_EMAIL) || 'admin@routism.com')
    .trim()
    .toLowerCase();
  const password = arg('password', process.env.SEED_USER_PASSWORD) || 'RoutismAdmin123!';
  const name = arg('name', process.env.SEED_USER_NAME) || 'Routism Admin';
  const timezone = arg('timezone', process.env.SEED_USER_TIMEZONE) || env.DEFAULT_TIMEZONE;

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const existing = await queryRows(
    'SELECT id, email FROM rs_users WHERE email = ? LIMIT 1',
    [email]
  );

  if (existing[0]) {
    console.log(`User already exists: ${existing[0].email} (${existing[0].id})`);
    console.log('No changes made.');
    return;
  }

  const id = newId();
  const passwordHash = await bcrypt.hash(password, 12);

  await queryExec(
    `INSERT INTO rs_users (id, email, password_hash, name, timezone)
     VALUES (?, ?, ?, ?, ?)`,
    [id, email, passwordHash, name, timezone]
  );

  console.log('Database user created in rs_users:');
  console.log(`  id:        ${id}`);
  console.log(`  email:     ${email}`);
  console.log(`  name:      ${name}`);
  console.log(`  timezone:  ${timezone}`);
  console.log(`  password:  ${password}`);
  console.log('Sign in at /login with this email and password.');
}

seedUser()
  .catch((err) => {
    console.error('Seed failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
