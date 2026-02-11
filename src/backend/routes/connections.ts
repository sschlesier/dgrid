import { FastifyInstance } from 'fastify';
import { MongoClient } from 'mongodb';
import { ConnectionStorage, StoredConnection } from '../storage/connections.js';
import { PasswordStorage } from '../storage/keyring.js';
import { ConnectionPool } from '../db/mongodb.js';
import {
  CreateConnectionRequest,
  UpdateConnectionRequest,
  ConnectionResponse,
  TestConnectionRequest,
  TestConnectionResponse,
  ConnectRequest,
} from '../../shared/contracts.js';

export interface ConnectionRoutesOptions {
  storage: ConnectionStorage;
  passwords: PasswordStorage;
  pool: ConnectionPool;
}

/** Strip credentials from a MongoDB URI, returning the cleaned URI plus extracted username/password. */
export function stripCredentials(uri: string): {
  strippedUri: string;
  username: string;
  password: string;
} {
  const parsed = new URL(uri);
  const username = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);

  // Remove credentials from the URL
  parsed.username = '';
  parsed.password = '';

  // URL.toString() re-encodes, so we build from parts to avoid double-encoding
  let strippedUri = `${parsed.protocol}//`;
  strippedUri += parsed.host;
  strippedUri += parsed.pathname;
  if (parsed.search) strippedUri += parsed.search;

  return { strippedUri, username, password };
}

/** Re-insert credentials into a credential-stripped URI for connecting. */
export function injectCredentials(uri: string, username: string, password: string): string {
  if (!username) return uri;

  const parsed = new URL(uri);
  parsed.username = encodeURIComponent(username);
  if (password) {
    parsed.password = encodeURIComponent(password);
  }

  // Rebuild to avoid URL class encoding issues
  let result = `${parsed.protocol}//`;
  result += encodeURIComponent(username);
  if (password) result += ':' + encodeURIComponent(password);
  result += '@';
  result += parsed.host;
  result += parsed.pathname;
  if (parsed.search) result += parsed.search;

  return result;
}

/** Extract database name from a MongoDB URI. */
function getDatabaseFromUri(uri: string): string | undefined {
  try {
    const parsed = new URL(uri);
    const db = parsed.pathname.slice(1); // remove leading /
    return db || undefined;
  } catch {
    return undefined;
  }
}

function toConnectionResponse(
  conn: StoredConnection & { error?: string },
  isConnected: boolean
): ConnectionResponse {
  return {
    id: conn.id,
    name: conn.name,
    uri: conn.uri,
    username: conn.username,
    savePassword: conn.savePassword,
    isConnected,
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
    error: conn.error,
  };
}

export async function connectionRoutes(
  fastify: FastifyInstance,
  opts: ConnectionRoutesOptions
): Promise<void> {
  const { storage, passwords, pool } = opts;

  // List all connections
  fastify.get('/', async (_request, reply) => {
    const connections = await storage.list();
    const response: ConnectionResponse[] = connections.map((conn) =>
      toConnectionResponse(conn, pool.isConnected(conn.id))
    );
    return reply.send(response);
  });

  // Get single connection
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const conn = await storage.get(request.params.id);
    if (!conn) {
      return reply.status(404).send({
        error: 'NotFound',
        message: `Connection '${request.params.id}' not found`,
        statusCode: 404,
      });
    }
    return reply.send(toConnectionResponse(conn, pool.isConnected(conn.id)));
  });

  // Create connection
  fastify.post<{ Body: CreateConnectionRequest }>('/', async (request, reply) => {
    const { name, uri, savePassword = true } = request.body;

    // Strip credentials from the URI before storing
    const { strippedUri, username, password } = stripCredentials(uri);

    const conn = await storage.create({
      name,
      uri: strippedUri,
      username: username || undefined,
      savePassword,
    });

    if (password && savePassword) {
      await passwords.set(conn.id, password);
    }

    return reply.status(201).send(toConnectionResponse(conn, false));
  });

  // Update connection
  fastify.put<{ Params: { id: string }; Body: UpdateConnectionRequest }>(
    '/:id',
    async (request, reply) => {
      const { name, uri, savePassword } = request.body;

      try {
        const updates: Partial<Omit<StoredConnection, 'id' | 'createdAt'>> = {};

        if (name !== undefined) {
          updates.name = name;
        }

        if (savePassword !== undefined) {
          updates.savePassword = savePassword;
        }

        // Determine effective savePassword: use request value, fall back to stored value
        let effectiveSavePassword = savePassword;
        if (effectiveSavePassword === undefined) {
          const existing = await storage.get(request.params.id);
          effectiveSavePassword = existing?.savePassword ?? true;
        }

        if (uri !== undefined) {
          const { strippedUri, username, password } = stripCredentials(uri);
          updates.uri = strippedUri;
          updates.username = username || undefined;

          if (password && effectiveSavePassword) {
            await passwords.set(request.params.id, password);
          } else {
            // No password, or savePassword is false — clear stored password
            await passwords.delete(request.params.id);
          }
        } else if (savePassword === false) {
          // URI not changed but savePassword flipped to false — clear keyring
          await passwords.delete(request.params.id);
        }

        const conn = await storage.update(request.params.id, updates);

        return reply.send(toConnectionResponse(conn, pool.isConnected(conn.id)));
      } catch (e) {
        const error = e as Error;
        if (error.message.includes('not found')) {
          return reply.status(404).send({
            error: 'NotFound',
            message: error.message,
            statusCode: 404,
          });
        }
        throw e;
      }
    }
  );

  // Delete connection
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = request.params.id;

    // Disconnect if connected
    if (pool.isConnected(id)) {
      await pool.disconnect(id);
    }

    try {
      await storage.delete(id);
      await passwords.delete(id);
      return reply.status(204).send();
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('not found')) {
        return reply.status(404).send({
          error: 'NotFound',
          message: error.message,
          statusCode: 404,
        });
      }
      throw e;
    }
  });

  // Test unsaved connection (must be before /:id/test to match correctly)
  fastify.post<{ Body: TestConnectionRequest }>('/test', async (request, reply) => {
    const { uri } = request.body;

    const startTime = Date.now();
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });

    try {
      await client.connect();
      await client.db('admin').command({ ping: 1 });
      const latencyMs = Date.now() - startTime;

      const response: TestConnectionResponse = {
        success: true,
        message: 'Connection successful',
        latencyMs,
      };
      return reply.send(response);
    } catch (e) {
      const error = e as Error;
      const response: TestConnectionResponse = {
        success: false,
        message: error.message,
      };
      return reply.send(response);
    } finally {
      await client.close();
    }
  });

  // Test saved connection by ID
  fastify.post<{ Params: { id: string }; Body: { password?: string } }>(
    '/:id/test',
    async (request, reply) => {
      const conn = await storage.get(request.params.id);
      if (!conn) {
        return reply.status(404).send({
          error: 'NotFound',
          message: `Connection '${request.params.id}' not found`,
          statusCode: 404,
        });
      }

      if (conn.error) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: conn.error,
          statusCode: 400,
        });
      }

      const bodyPassword = (request.body as { password?: string } | undefined)?.password;
      const password = bodyPassword ?? (await passwords.get(conn.id));
      const uri = conn.username
        ? injectCredentials(conn.uri, conn.username, password ?? '')
        : conn.uri;

      const startTime = Date.now();
      const client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });

      try {
        await client.connect();
        await client.db('admin').command({ ping: 1 });
        const latencyMs = Date.now() - startTime;

        const response: TestConnectionResponse = {
          success: true,
          message: 'Connection successful',
          latencyMs,
        };
        return reply.send(response);
      } catch (e) {
        const error = e as Error;
        const response: TestConnectionResponse = {
          success: false,
          message: error.message,
        };
        return reply.send(response);
      } finally {
        await client.close();
      }
    }
  );

  // Connect
  fastify.post<{ Params: { id: string }; Body: ConnectRequest }>(
    '/:id/connect',
    async (request, reply) => {
      const id = request.params.id;
      const body = (request.body ?? {}) as ConnectRequest;

      // Force-disconnect stale entry so reconnect always works
      if (pool.isConnected(id)) {
        await pool.forceDisconnect(id);
      }

      let conn = await storage.get(id);
      if (!conn) {
        return reply.status(404).send({
          error: 'NotFound',
          message: `Connection '${id}' not found`,
          statusCode: 404,
        });
      }

      if (conn.error) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: conn.error,
          statusCode: 400,
        });
      }

      // "Remember password" flow: persist password to keyring and update connection
      if (body.savePassword && body.password) {
        await passwords.set(id, body.password);
        conn = await storage.update(id, { savePassword: true });
      }

      const password = body.password ?? (await passwords.get(conn.id));
      const uri = conn.username
        ? injectCredentials(conn.uri, conn.username, password ?? '')
        : conn.uri;
      const database = getDatabaseFromUri(conn.uri);

      try {
        await pool.connect(id, { uri, database });
        return reply.send(toConnectionResponse(conn, true));
      } catch (e) {
        const error = e as Error;
        return reply.status(500).send({
          error: 'ConnectionFailed',
          message: error.message,
          statusCode: 500,
        });
      }
    }
  );

  // Disconnect
  fastify.post<{ Params: { id: string } }>('/:id/disconnect', async (request, reply) => {
    const id = request.params.id;

    const conn = await storage.get(id);
    if (!conn) {
      return reply.status(404).send({
        error: 'NotFound',
        message: `Connection '${id}' not found`,
        statusCode: 404,
      });
    }

    // Use forceDisconnect to handle both active and stale connections
    await pool.forceDisconnect(id);
    return reply.send(toConnectionResponse(conn, false));
  });
}
