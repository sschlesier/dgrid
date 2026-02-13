import { FastifyReply } from 'fastify';
import { Db, MongoClient } from 'mongodb';
import { ConnectionPool, isConnectionError } from '../db/mongodb.js';

export function requireConnection(
  pool: ConnectionPool,
  id: string,
  reply: FastifyReply
): boolean {
  if (!pool.isConnected(id)) {
    reply.status(400).send({
      error: 'BadRequest',
      message: 'Connection not active. Please connect first.',
      statusCode: 400,
    });
    return false;
  }
  return true;
}

export function requireDatabase(
  pool: ConnectionPool,
  id: string,
  database: string,
  reply: FastifyReply
): Db | null {
  const db = pool.getDb(id, database);
  if (!db) {
    reply.status(400).send({
      error: 'BadRequest',
      message: 'Database not found or not specified.',
      statusCode: 400,
    });
    return null;
  }
  return db;
}

export function requireClient(
  pool: ConnectionPool,
  id: string,
  reply: FastifyReply
): MongoClient | null {
  const client = pool.getClient(id);
  if (!client) {
    reply.status(500).send({
      error: 'InternalError',
      message: 'Failed to get database client',
      statusCode: 500,
    });
    return null;
  }
  return client;
}

export async function handleConnectionError(
  pool: ConnectionPool,
  id: string,
  reply: FastifyReply,
  error: unknown,
  errorType: string
): Promise<void> {
  if (isConnectionError(error)) {
    await pool.forceDisconnect(id);
    reply.status(500).send({
      error: errorType,
      message: (error as Error).message,
      statusCode: 500,
      isConnected: false,
    });
    return;
  }
  reply.status(500).send({
    error: errorType,
    message: (error as Error).message,
    statusCode: 500,
  });
}
