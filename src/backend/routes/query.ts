import { FastifyInstance } from 'fastify';
import { ConnectionPool, isConnectionError } from '../db/mongodb.js';
import { parseQuery, executeQuery } from '../db/queries.js';
import { serializeDocument } from '../db/bson.js';
import { ExecuteQueryRequest, ExecuteQueryResponse } from '../../shared/contracts.js';

export interface QueryRoutesOptions {
  pool: ConnectionPool;
}

export async function queryRoutes(
  fastify: FastifyInstance,
  opts: QueryRoutesOptions
): Promise<void> {
  const { pool } = opts;

  // Execute query
  fastify.post<{ Params: { id: string }; Body: ExecuteQueryRequest }>(
    '/connections/:id/query',
    async (request, reply) => {
      const { id } = request.params;
      const { query, database, page = 1, pageSize = 50 } = request.body;

      if (!pool.isConnected(id)) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: 'Connection not active. Please connect first.',
          statusCode: 400,
        });
      }

      const db = pool.getDb(id, database);
      if (!db) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: 'Database not found or not specified.',
          statusCode: 400,
        });
      }

      // Parse the query
      const parseResult = parseQuery(query);
      if (!parseResult.ok) {
        return reply.status(400).send({
          error: 'QueryParseError',
          message: parseResult.error.message,
          statusCode: 400,
          details: {
            position: parseResult.error.position,
          },
        });
      }

      // Execute the query
      const execResult = await executeQuery(db, parseResult.value, {
        page,
        pageSize: pageSize as 50 | 100 | 250 | 500,
      });

      if (!execResult.ok) {
        // Auto-disconnect on connection-level errors
        if (isConnectionError(execResult.error.cause)) {
          await pool.forceDisconnect(id);
          return reply.status(500).send({
            error: execResult.error.code ?? 'QueryError',
            message: execResult.error.message,
            statusCode: 500,
            isConnected: false,
          });
        }

        const statusCode = execResult.error.code === 'TIMEOUT' ? 504 : 500;
        return reply.status(statusCode).send({
          error: execResult.error.code ?? 'QueryError',
          message: execResult.error.message,
          statusCode,
        });
      }

      // Serialize BSON documents for JSON transport
      const serializedDocuments = execResult.value.documents.map((doc) => serializeDocument(doc));

      const response: ExecuteQueryResponse = {
        documents: serializedDocuments,
        totalCount: execResult.value.totalCount,
        page,
        pageSize,
        hasMore: execResult.value.hasMore,
        executionTimeMs: execResult.value.executionTimeMs,
      };

      return reply.send(response);
    }
  );
}
