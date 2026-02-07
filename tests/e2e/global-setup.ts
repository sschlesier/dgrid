import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdtemp, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function globalSetup(): Promise<void> {
  // Start in-memory MongoDB
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  const url = new URL(uri);

  const host = url.hostname;
  const port = parseInt(url.port, 10);

  // Create temp directory for backend data (connections.json, etc.)
  const tempDir = await mkdtemp(join(tmpdir(), 'dgrid-e2e-'));

  // Set env var so webServer backend process uses temp dir
  process.env.DGRID_DATA_DIR = tempDir;

  // Write mongo info for tests to read
  const mongoInfo = { host, port, tempDir };
  await writeFile(join(__dirname, '.mongo-info.json'), JSON.stringify(mongoInfo, null, 2));

  // Store mongod on global so teardown can access it
  (globalThis as Record<string, unknown>).__E2E_MONGOD__ = mongod;
  (globalThis as Record<string, unknown>).__E2E_TEMP_DIR__ = tempDir;

  console.log(`E2E MongoDB started on ${host}:${port}`);
  console.log(`E2E data dir: ${tempDir}`);
}

export default globalSetup;
