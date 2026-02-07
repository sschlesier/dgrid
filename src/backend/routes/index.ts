import { FastifyInstance } from 'fastify';
import { connectionRoutes } from './connections.js';
import { databaseRoutes } from './databases.js';
import { queryRoutes } from './query.js';
import { documentRoutes } from './documents.js';
import { fileRoutes } from './files.js';
import { ConnectionStorage } from '../storage/connections.js';
import { PasswordStorage } from '../storage/keyring.js';
import { ConnectionPool } from '../db/mongodb.js';

export interface ApiRoutesOptions {
  storage: ConnectionStorage;
  passwords: PasswordStorage;
  pool: ConnectionPool;
}

export async function apiRoutes(fastify: FastifyInstance, opts: ApiRoutesOptions): Promise<void> {
  const { storage, passwords, pool } = opts;

  // Register connection routes
  await fastify.register(connectionRoutes, {
    prefix: '/connections',
    storage,
    passwords,
    pool,
  });

  // Register database routes (uses same pool)
  await fastify.register(databaseRoutes, {
    pool,
  });

  // Register query routes
  await fastify.register(queryRoutes, {
    pool,
  });

  // Register document routes
  await fastify.register(documentRoutes, {
    pool,
  });

  // Register file routes
  await fastify.register(fileRoutes, {
    prefix: '/files',
  });
}
