import { MongoClient, Db } from 'mongodb';

export interface MongoConnectionOptions {
  uri: string;
  database?: string;
}

export interface ConnectionPool {
  connect(id: string, options: MongoConnectionOptions): Promise<void>;
  disconnect(id: string): Promise<void>;
  forceDisconnect(id: string): Promise<void>;
  getClient(id: string): MongoClient | undefined;
  getDb(id: string, dbName?: string): Db | undefined;
  isConnected(id: string): boolean;
  listConnections(): string[];
  disconnectAll(): Promise<void>;
}

interface PooledConnection {
  client: MongoClient;
  options: MongoConnectionOptions;
}

export function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const name = error.name;
  return (
    name === 'MongoNetworkError' ||
    name === 'MongoNetworkTimeoutError' ||
    name === 'MongoServerSelectionError' ||
    name === 'MongoNotConnectedError'
  );
}

export function createConnectionPool(): ConnectionPool {
  const connections = new Map<string, PooledConnection>();

  return {
    async connect(id: string, options: MongoConnectionOptions): Promise<void> {
      if (connections.has(id)) {
        throw new Error(`Connection '${id}' already exists`);
      }

      const client = new MongoClient(options.uri);
      await client.connect();

      connections.set(id, { client, options });
    },

    async disconnect(id: string): Promise<void> {
      const connection = connections.get(id);
      if (!connection) {
        throw new Error(`Connection '${id}' not found`);
      }

      await connection.client.close();
      connections.delete(id);
    },

    async forceDisconnect(id: string): Promise<void> {
      const connection = connections.get(id);
      if (!connection) return;
      connections.delete(id);
      try {
        await connection.client.close();
      } catch {
        /* ignore — connection is already broken */
      }
    },

    getClient(id: string): MongoClient | undefined {
      return connections.get(id)?.client;
    },

    getDb(id: string, dbName?: string): Db | undefined {
      const connection = connections.get(id);
      if (!connection) {
        return undefined;
      }

      const database = dbName ?? connection.options.database;
      if (!database) {
        return undefined;
      }

      return connection.client.db(database);
    },

    isConnected(id: string): boolean {
      return connections.has(id);
    },

    listConnections(): string[] {
      return Array.from(connections.keys());
    },

    async disconnectAll(): Promise<void> {
      const ids = Array.from(connections.keys());
      await Promise.all(ids.map((id) => this.disconnect(id)));
    },
  };
}
