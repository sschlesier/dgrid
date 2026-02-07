import { MongoMemoryServer } from 'mongodb-memory-server';
import { rm, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function globalTeardown(): Promise<void> {
  // Stop MongoDB
  const mongod = (globalThis as Record<string, unknown>).__E2E_MONGOD__ as
    | MongoMemoryServer
    | undefined;
  if (mongod) {
    await mongod.stop();
    console.log('E2E MongoDB stopped');
  }

  // Clean up temp data directory
  const tempDir = (globalThis as Record<string, unknown>).__E2E_TEMP_DIR__ as string | undefined;
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    console.log(`E2E data dir removed: ${tempDir}`);
  }

  // Clean up mongo info file
  try {
    await unlink(join(__dirname, '.mongo-info.json'));
  } catch {
    // Ignore if already removed
  }
}

export default globalTeardown;
