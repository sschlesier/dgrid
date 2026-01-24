import { randomUUID } from 'crypto';
import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { join, dirname } from 'path';

export interface StoredConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  database?: string;
  username?: string;
  authSource?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionStorage {
  list(): Promise<StoredConnection[]>;
  get(id: string): Promise<StoredConnection | undefined>;
  create(conn: Omit<StoredConnection, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredConnection>;
  update(
    id: string,
    updates: Partial<Omit<StoredConnection, 'id' | 'createdAt'>>
  ): Promise<StoredConnection>;
  delete(id: string): Promise<void>;
}

interface ConnectionsFile {
  version: number;
  connections: StoredConnection[];
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (e) {
    const error = e as Error & { code?: string };
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function readConnectionsFile(filePath: string): Promise<ConnectionsFile> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as ConnectionsFile;
  } catch (e) {
    const error = e as Error & { code?: string };
    if (error.code === 'ENOENT') {
      return { version: 1, connections: [] };
    }
    throw error;
  }
}

async function writeConnectionsFile(filePath: string, data: ConnectionsFile): Promise<void> {
  await ensureDir(dirname(filePath));

  // Atomic write: write to temp file, then rename
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  const content = JSON.stringify(data, null, 2);

  await writeFile(tempPath, content, 'utf-8');
  await rename(tempPath, filePath);
}

export function createConnectionStorage(dataDir: string): ConnectionStorage {
  const filePath = join(dataDir, 'connections.json');

  return {
    async list(): Promise<StoredConnection[]> {
      const data = await readConnectionsFile(filePath);
      return data.connections;
    },

    async get(id: string): Promise<StoredConnection | undefined> {
      const data = await readConnectionsFile(filePath);
      return data.connections.find((c) => c.id === id);
    },

    async create(
      conn: Omit<StoredConnection, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<StoredConnection> {
      const data = await readConnectionsFile(filePath);

      const now = new Date().toISOString();
      const newConnection: StoredConnection = {
        ...conn,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };

      data.connections.push(newConnection);
      await writeConnectionsFile(filePath, data);

      return newConnection;
    },

    async update(
      id: string,
      updates: Partial<Omit<StoredConnection, 'id' | 'createdAt'>>
    ): Promise<StoredConnection> {
      const data = await readConnectionsFile(filePath);
      const index = data.connections.findIndex((c) => c.id === id);

      if (index === -1) {
        throw new Error(`Connection '${id}' not found`);
      }

      const updated: StoredConnection = {
        ...data.connections[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      data.connections[index] = updated;
      await writeConnectionsFile(filePath, data);

      return updated;
    },

    async delete(id: string): Promise<void> {
      const data = await readConnectionsFile(filePath);
      const index = data.connections.findIndex((c) => c.id === id);

      if (index === -1) {
        throw new Error(`Connection '${id}' not found`);
      }

      data.connections.splice(index, 1);
      await writeConnectionsFile(filePath, data);
    },
  };
}
