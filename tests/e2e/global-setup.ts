/**
 * Playwright globalSetup: starts mongodb-memory-server for E2E test data seeding.
 *
 * Note: E2E tests currently need Tauri integration to work fully.
 * The frontend uses Tauri IPC (invoke), which requires the Tauri runtime.
 * MongoDB is started here so test fixtures can seed data via the mongodb driver.
 */

import { writeFileSync } from 'fs';
import { mkdtempSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function globalSetup(): Promise<void> {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  const url = new URL(uri);
  const host = url.hostname;
  const port = parseInt(url.port, 10);

  const tempDir = mkdtempSync(join(tmpdir(), 'dgrid-e2e-'));

  const mongoInfo = { host, port, tempDir };
  const mongoInfoPath = join(__dirname, '.mongo-info.json');
  writeFileSync(mongoInfoPath, JSON.stringify(mongoInfo, null, 2));

  console.log(`E2E MongoDB started on ${host}:${port}`);
  console.log(`E2E data dir: ${tempDir}`);

  // Store mongod instance for teardown
  (globalThis as Record<string, unknown>).__MONGOD__ = mongod;
  (globalThis as Record<string, unknown>).__TEMP_DIR__ = tempDir;
}

export default globalSetup;
