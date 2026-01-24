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
} from '../../shared/contracts.js';

export interface ConnectionRoutesOptions {
  storage: ConnectionStorage;
  passwords: PasswordStorage;
  pool: ConnectionPool;
}

interface MongoConnectionParams {
  host: string;
  port: number;
  database?: string;
  username?: string;
  password?: string;
  authSource?: string;
}

function buildMongoUri(conn: MongoConnectionParams): string {
  let uri = 'mongodb://';

  if (conn.username) {
    uri += encodeURIComponent(conn.username);
    if (conn.password) {
      uri += ':' + encodeURIComponent(conn.password);
    }
    uri += '@';
  }

  uri += `${conn.host}:${conn.port}`;

  if (conn.database) {
    uri += `/${conn.database}`;
  }

  const params: string[] = [];
  if (conn.authSource) {
    params.push(`authSource=${conn.authSource}`);
  }

  if (params.length > 0) {
    uri += '?' + params.join('&');
  }

  return uri;
}

function toConnectionResponse(conn: StoredConnection, isConnected: boolean): ConnectionResponse {
  return {
    id: conn.id,
    name: conn.name,
    host: conn.host,
    port: conn.port,
    database: conn.database,
    username: conn.username,
    authSource: conn.authSource,
    isConnected,
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
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
    const { password, ...connData } = request.body;

    const conn = await storage.create(connData);

    if (password) {
      await passwords.set(conn.id, password);
    }

    return reply.status(201).send(toConnectionResponse(conn, false));
  });

  // Update connection
  fastify.put<{ Params: { id: string }; Body: UpdateConnectionRequest }>(
    '/:id',
    async (request, reply) => {
      const { password, ...updates } = request.body;

      try {
        const conn = await storage.update(request.params.id, updates);

        if (password !== undefined) {
          if (password) {
            await passwords.set(conn.id, password);
          } else {
            await passwords.delete(conn.id);
          }
        }

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
    const { host, port, database, username, password, authSource } = request.body;
    const uri = buildMongoUri({ host, port, database, username, password, authSource });

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
  fastify.post<{ Params: { id: string } }>('/:id/test', async (request, reply) => {
    const conn = await storage.get(request.params.id);
    if (!conn) {
      return reply.status(404).send({
        error: 'NotFound',
        message: `Connection '${request.params.id}' not found`,
        statusCode: 404,
      });
    }

    const password = await passwords.get(conn.id);
    const uri = buildMongoUri({ ...conn, password });

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

  // Connect
  fastify.post<{ Params: { id: string } }>('/:id/connect', async (request, reply) => {
    const id = request.params.id;

    if (pool.isConnected(id)) {
      return reply.status(400).send({
        error: 'BadRequest',
        message: 'Connection already active',
        statusCode: 400,
      });
    }

    const conn = await storage.get(id);
    if (!conn) {
      return reply.status(404).send({
        error: 'NotFound',
        message: `Connection '${id}' not found`,
        statusCode: 404,
      });
    }

    const password = await passwords.get(conn.id);
    const uri = buildMongoUri({ ...conn, password });

    try {
      await pool.connect(id, { uri, database: conn.database });
      return reply.send(toConnectionResponse(conn, true));
    } catch (e) {
      const error = e as Error;
      return reply.status(500).send({
        error: 'ConnectionFailed',
        message: error.message,
        statusCode: 500,
      });
    }
  });

  // Disconnect
  fastify.post<{ Params: { id: string } }>('/:id/disconnect', async (request, reply) => {
    const id = request.params.id;

    if (!pool.isConnected(id)) {
      return reply.status(400).send({
        error: 'BadRequest',
        message: 'Connection not active',
        statusCode: 400,
      });
    }

    const conn = await storage.get(id);
    if (!conn) {
      return reply.status(404).send({
        error: 'NotFound',
        message: `Connection '${id}' not found`,
        statusCode: 404,
      });
    }

    await pool.disconnect(id);
    return reply.send(toConnectionResponse(conn, false));
  });
}
