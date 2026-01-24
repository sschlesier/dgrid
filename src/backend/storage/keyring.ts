import { Entry } from '@napi-rs/keyring';

export interface PasswordStorage {
  get(connectionId: string): Promise<string | undefined>;
  set(connectionId: string, password: string): Promise<void>;
  delete(connectionId: string): Promise<void>;
}

const DEFAULT_SERVICE_NAME = 'dgrid-mongodb-gui';

export function createPasswordStorage(serviceName: string = DEFAULT_SERVICE_NAME): PasswordStorage {
  return {
    async get(connectionId: string): Promise<string | undefined> {
      try {
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
        const entry = new Entry(serviceName, connectionId);
        entry.setPassword(password);
      } catch (e) {
        const error = e as Error;
        throw new Error(`Failed to store password: ${error.message}`);
      }
    },

    async delete(connectionId: string): Promise<void> {
      try {
        const entry = new Entry(serviceName, connectionId);
        entry.deletePassword();
      } catch {
        // Ignore errors when deleting - entry might not exist
      }
    },
  };
}
