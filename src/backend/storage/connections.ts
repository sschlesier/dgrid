import { randomUUID } from 'crypto';
import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { join, dirname } from 'path';

export interface StoredConnection {
  id: string;
  name: string;
  uri: string; // credential-stripped MongoDB URI
  username?: string; // stored separately for credential reconstruction
  createdAt: string;
  updatedAt: string;
}

/** Raw connection as stored on disk — may include old-format fields. */
interface RawStoredConnection {
  id: string;
  name: string;
  uri?: string;
  username?: string;
  // Old-format fields (v1)
  host?: string;
  port?: number;
  database?: string;
  authSource?: string;
  createdAt: string;
  updatedAt: string;
}

/** Check if a raw connection is old-format (missing uri field). */
export function isOldFormat(conn: RawStoredConnection): boolean {
  return !conn.uri && !!conn.host;
}

/** Convert a raw connection to StoredConnection, flagging old-format ones. */
function toStoredConnection(raw: RawStoredConnection): StoredConnection & { error?: string } {
  if (isOldFormat(raw)) {
    return {
      id: raw.id,
      name: raw.name,
      uri: '', // empty — old format
      username: raw.username,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      error: 'This connection uses an old format. Please delete and re-create it.',
    };
  }
  return {
    id: raw.id,
    name: raw.name,
    uri: raw.uri!,
    username: raw.username,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export interface ConnectionStorage {
  list(): Promise<(StoredConnection & { error?: string })[]>;
  get(id: string): Promise<(StoredConnection & { error?: string }) | undefined>;
  create(conn: Omit<StoredConnection, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredConnection>;
  update(
    id: string,
    updates: Partial<Omit<StoredConnection, 'id' | 'createdAt'>>
  ): Promise<StoredConnection>;
  delete(id: string): Promise<void>;
}

interface ConnectionsFile {
  version: number;
  connections: RawStoredConnection[];
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
    async list(): Promise<(StoredConnection & { error?: string })[]> {
      const data = await readConnectionsFile(filePath);
      return data.connections.map(toStoredConnection);
    },

    async get(id: string): Promise<(StoredConnection & { error?: string }) | undefined> {
      const data = await readConnectionsFile(filePath);
      const raw = data.connections.find((c) => c.id === id);
      return raw ? toStoredConnection(raw) : undefined;
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

      const raw = data.connections[index];
      const updated: RawStoredConnection = {
        id: raw.id,
        name: updates.name ?? raw.name,
        uri: updates.uri ?? raw.uri,
        username: updates.username !== undefined ? updates.username : raw.username,
        createdAt: raw.createdAt,
        updatedAt: new Date().toISOString(),
      };

      data.connections[index] = updated;
      await writeConnectionsFile(filePath, data);

      return {
        id: updated.id,
        name: updated.name,
        uri: updated.uri ?? '',
        username: updated.username,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
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
