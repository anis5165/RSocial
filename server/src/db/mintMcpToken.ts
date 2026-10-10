import { loginUser } from '../services/auth/authService';
import { mintPersonalAccessToken } from '../mcp/oauth/store';
import { pool } from './pool';
import { queryExec } from './pool';

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

async function ensureCliClient() {
  await queryExec(
    `INSERT IGNORE INTO rs_mcp_clients
      (client_id, client_secret_hash, client_name, redirect_uris, grant_types, response_types,
       token_endpoint_auth_method, scope, client_id_issued_at, client_secret_expires_at)
     VALUES (
       'routism-cli', NULL, 'Routism CLI / Inspector',
       '[]', '["refresh_token"]', '[]', 'none', 'mcp:tools', UNIX_TIMESTAMP(), 0
     )`
  );
}

async function main() {
  const email = arg('email') || process.env.SEED_USER_EMAIL || 'admin@routism.com';
  const password = arg('password') || process.env.SEED_USER_PASSWORD || 'RoutismAdmin123!';

  await ensureCliClient();
  const user = await loginUser(email, password);
  const tokens = await mintPersonalAccessToken(user.id);

  console.log('MCP personal access token minted (local/inspector testing):');
  console.log(`  userId:       ${user.id}`);
  console.log(`  email:        ${user.email}`);
  console.log(`  accessToken:  ${tokens.accessToken}`);
  console.log(`  expiresIn:    ${tokens.expiresIn}s`);
  console.log('');
  console.log('Inspector / curl Authorization header:');
  console.log(`  Bearer ${tokens.accessToken}`);
  console.log('');
  console.log(`MCP URL: ${process.env.API_BASE_URL || 'http://localhost:4000'}/mcp`);
}

main()
  .catch((err) => {
    console.error('mint failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
