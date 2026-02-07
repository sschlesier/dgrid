/**
 * E2E backend wrapper: starts mongodb-memory-server, writes .mongo-info.json,
 * then launches the backend with DGRID_DATA_DIR pointing at an isolated temp dir.
 *
 * Playwright starts webServer processes BEFORE globalSetup, so MongoDB must be
 * bootstrapped here rather than in global-setup.ts.
 *
 * Usage: node tests/e2e/run-backend-e2e.js
 * Cwd must be project root.
 */

import { writeFileSync, unlinkSync, rmSync } from 'fs';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

const cwd = process.cwd();
const mongoInfoPath = join(cwd, 'tests/e2e/.mongo-info.json');

// Start in-memory MongoDB
const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongod = await MongoMemoryServer.create();
const uri = mongod.getUri();
const url = new URL(uri);
const host = url.hostname;
const port = parseInt(url.port, 10);

// Create temp directory for backend data (connections.json, etc.)
const tempDir = mkdtempSync(join(tmpdir(), 'dgrid-e2e-'));

// Write mongo info so test fixtures can read it
const mongoInfo = { host, port, tempDir };
writeFileSync(mongoInfoPath, JSON.stringify(mongoInfo, null, 2));

console.log(`E2E MongoDB started on ${host}:${port}`);
console.log(`E2E data dir: ${tempDir}`);

// Start the backend with DGRID_DATA_DIR set (disables rate limiting)
const env = { ...process.env, DGRID_DATA_DIR: tempDir };
const child = spawn('pnpm', ['dev:backend'], {
  env,
  cwd,
  stdio: 'inherit',
  shell: true,
});

let exiting = false;

async function cleanup(exitCode) {
  if (exiting) return;
  exiting = true;
  child.kill('SIGTERM');
  try { await mongod.stop(); } catch { /* best effort */ }
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
  try { unlinkSync(mongoInfoPath); } catch { /* best effort */ }
  process.exit(exitCode);
}

process.on('SIGTERM', () => cleanup(143));
process.on('SIGINT', () => cleanup(130));

child.on('exit', (code, signal) => {
  const exitCode = signal ? 128 + (signal === 'SIGTERM' ? 15 : 2) : code ?? 0;
  cleanup(exitCode);
});
