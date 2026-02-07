/**
 * E2E-only: starts the backend with DGRID_DATA_DIR from tests/e2e/.mongo-info.json.
 * Playwright's globalSetup runs in a separate process, so the webServer child never
 * receives DGRID_DATA_DIR unless we set it here (backend then skips rate limiting).
 *
 * Usage: node tests/e2e/run-backend-e2e.js
 * Cwd must be project root. globalSetup must have run first (writes .mongo-info.json).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';

const cwd = process.cwd();
const mongoInfoPath = join(cwd, 'tests/e2e/.mongo-info.json');
const raw = readFileSync(mongoInfoPath, 'utf-8');
const { tempDir } = JSON.parse(raw);

const env = { ...process.env, DGRID_DATA_DIR: tempDir };
const child = spawn('pnpm', ['dev:backend'], {
  env,
  cwd,
  stdio: 'inherit',
  shell: true,
});

function shutdown(signal) {
  child.kill(signal);
  process.exit(128 + (signal === 'SIGTERM' ? 15 : signal === 'SIGINT' ? 2 : 0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

child.on('exit', (code, signal) => {
  process.off('SIGTERM', shutdown);
  process.off('SIGINT', shutdown);
  process.exit(signal ? 128 + (signal === 'SIGTERM' ? 15 : 2) : code ?? 0);
});
