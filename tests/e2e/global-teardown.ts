import { unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Playwright globalTeardown. MongoDB cleanup is handled by run-backend-e2e.js
 * when its process exits. This just removes .mongo-info.json if it wasn't
 * cleaned up already.
 */
async function globalTeardown(): Promise<void> {
  try {
    await unlink(join(__dirname, '.mongo-info.json'));
  } catch {
    // Already removed by run-backend-e2e.js — expected
  }
}

export default globalTeardown;
