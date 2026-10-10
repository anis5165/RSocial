/**
 * Render-safe starter: builds shared + server if dist is missing, then boots.
 * Works when Root Directory is "server" or repo root.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const serverRoot = path.join(__dirname, '..');
const repoRoot = path.join(serverRoot, '..');
const distIndex = path.join(serverRoot, 'dist', 'index.js');
const sharedDist = path.join(repoRoot, 'shared', 'dist', 'index.js');

function run(cmd, cwd) {
  console.log(`[render-start] ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', env: process.env });
}

function exists(p) {
  return fs.existsSync(p);
}

try {
  // Install monorepo deps if needed (Root Directory = server)
  if (!exists(path.join(repoRoot, 'node_modules', 'typescript')) &&
      !exists(path.join(serverRoot, 'node_modules', 'typescript'))) {
    if (exists(path.join(repoRoot, 'package.json'))) {
      run('npm install', repoRoot);
    } else {
      run('npm install', serverRoot);
    }
  }

  if (!exists(sharedDist) && exists(path.join(repoRoot, 'shared', 'package.json'))) {
    run('npm run build -w shared', repoRoot);
  }

  if (!exists(distIndex)) {
    run('npx tsc', serverRoot);
  }

  if (!exists(distIndex)) {
    console.error('[render-start] FAILED: server/dist/index.js was not created.');
    console.error('[render-start] Set Build Command to: npm run build:render');
    process.exit(1);
  }

  console.log('[render-start] starting server/dist/index.js');
  require(distIndex);
} catch (err) {
  console.error('[render-start] error:', err instanceof Error ? err.message : err);
  process.exit(1);
}
