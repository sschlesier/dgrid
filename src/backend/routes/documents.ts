import { FastifyInstance } from 'fastify';
import { ConnectionPool } from '../db/mongodb.js';
import { deserializeValue } from '../db/bson.js';
import { UpdateFieldRequest, UpdateFieldResponse } from '../../shared/contracts.js';

export interface DocumentRoutesOptions {
  pool: ConnectionPool;
}

export async function documentRoutes(
  fastify: FastifyInstance,
  opts: DocumentRoutesOptions
): Promise<void> {
  const { pool } = opts;

  // Update a single field in a document
  fastify.put<{ Params: { id: string }; Body: UpdateFieldRequest }>(
    '/connections/:id/documents/field',
    async (request, reply) => {
      const { id } = request.params;
      const { database, collection, documentId, fieldPath, value, type } = request.body;

      if (!database || !collection || documentId === undefined || !fieldPath || !type) {
        return reply.status(400).send({
          error: 'ValidationError',
          message: 'Missing required fields: database, collection, documentId, fieldPath, type',
          statusCode: 400,
        });
      }

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

      // Deserialize the document ID (may be ObjectId, etc.)
      const deserializedId = deserializeValue(documentId);

      // Deserialize the new value
      const deserializedValue = deserializeValue(value);

      const col = db.collection(collection);
      const result = await col.updateOne({ _id: deserializedId } as Record<string, unknown>, {
        $set: { [fieldPath]: deserializedValue },
      });

      const response: UpdateFieldResponse = {
        success: result.modifiedCount > 0 || result.matchedCount > 0,
        modifiedCount: result.modifiedCount,
      };

      return reply.send(response);
    }
  );
}
