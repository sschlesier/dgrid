import { join, dirname } from 'path';
import { existsSync, readdirSync } from 'fs';
import { createRequire } from 'module';
import { isSeaRuntime } from '../static.js';

// Use __filename for CJS compatibility when bundled by esbuild for SEA
// (import.meta.url becomes undefined in esbuild's CJS output)
const require = createRequire(typeof __filename !== 'undefined' ? __filename : import.meta.url);

export interface PasswordStorage {
  get(connectionId: string): Promise<string | undefined>;
  set(connectionId: string, password: string): Promise<void>;
  delete(connectionId: string): Promise<void>;
}

// Entry class from @napi-rs/keyring
interface KeyringEntry {
  getPassword(): string | null;
  setPassword(password: string): void;
  deletePassword(): void;
}

interface KeyringModule {
  Entry: new (service: string, user: string) => KeyringEntry;
}

let keyringModule: KeyringModule | null = null;

// For testing: reset the cached module
export function _resetKeyringModule(): void {
  keyringModule = null;
}

// For testing: inject a mock module
export function _setKeyringModule(module: KeyringModule | null): void {
  keyringModule = module;
}

function loadKeyringModule(): KeyringModule {
  if (keyringModule) return keyringModule;

  if (isSeaRuntime()) {
    // In SEA mode, load from native directory next to executable
    const execDir = dirname(process.execPath);
    const nativeDir = join(execDir, 'native');

    if (!existsSync(nativeDir)) {
      throw new Error(`Native modules directory not found: ${nativeDir}`);
    }

    // Find the keyring .node file
    const files = readdirSync(nativeDir);
    const keyringFile = files.find((f) => f.includes('keyring') && f.endsWith('.node'));

    if (!keyringFile) {
      throw new Error('Keyring native module not found in native directory');
    }

    const modulePath = join(nativeDir, keyringFile);

    keyringModule = require(modulePath) as KeyringModule;
  } else {
    // Normal mode - import from node_modules

    keyringModule = require('@napi-rs/keyring') as KeyringModule;
  }

  return keyringModule;
}

const DEFAULT_SERVICE_NAME = 'dgrid-mongodb-gui';

export function createPasswordStorage(serviceName: string = DEFAULT_SERVICE_NAME): PasswordStorage {
  return {
    async get(connectionId: string): Promise<string | undefined> {
      try {
        const { Entry } = loadKeyringModule();
        const entry = new Entry(serviceName, connectionId);
        const password = entry.getPassword();
        return password ?? undefined;
      } catch {
        // Keyring unavailable or entry not found
        return undefined;
      }
    },

    async set(connectionId: string, password: string): Promise<void> {
      try {
        const { Entry } = loadKeyringModule();
        const entry = new Entry(serviceName, connectionId);
        entry.setPassword(password);
      } catch (e) {
        const error = e as Error;
        throw new Error(`Failed to store password: ${error.message}`);
      }
    },

    async delete(connectionId: string): Promise<void> {
      try {
        const { Entry } = loadKeyringModule();
        const entry = new Entry(serviceName, connectionId);
        entry.deletePassword();
      } catch {
        // Ignore errors when deleting - entry might not exist
      }
    },
  };
}
