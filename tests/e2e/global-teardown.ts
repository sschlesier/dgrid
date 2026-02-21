import { unlink } from 'fs/promises';
import { rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function globalTeardown(): Promise<void> {
  // Stop MongoDB
  const mongod = (globalThis as Record<string, unknown>).__MONGOD__;
  if (mongod && typeof (mongod as { stop: () => Promise<void> }).stop === 'function') {
    try {
      await (mongod as { stop: () => Promise<void> }).stop();
    } catch {
      // best effort
    }
  }

  // Clean up temp dir
  const tempDir = (globalThis as Record<string, unknown>).__TEMP_DIR__;
  if (typeof tempDir === 'string') {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }

  // Remove .mongo-info.json
  try {
    await unlink(join(__dirname, '.mongo-info.json'));
  } catch {
    // Already removed — expected
  }
}

export default globalTeardown;
