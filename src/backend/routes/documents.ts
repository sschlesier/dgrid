import { FastifyInstance } from 'fastify';
import { ConnectionPool, isConnectionError } from '../db/mongodb.js';
import { deserializeValue } from '../db/bson.js';
import {
  UpdateFieldRequest,
  UpdateFieldResponse,
  DeleteDocumentRequest,
  DeleteDocumentResponse,
} from '../../shared/contracts.js';
import { requireConnection, requireDatabase, handleConnectionError } from './guards.js';

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

      if (!requireConnection(pool, id, reply)) return;
      const db = requireDatabase(pool, id, database, reply);
      if (!db) return;

      // Deserialize the document ID (may be ObjectId, etc.)
      const deserializedId = deserializeValue(documentId);

      // Deserialize the new value
      const deserializedValue = deserializeValue(value);

      try {
        const col = db.collection(collection);
        const result = await col.updateOne({ _id: deserializedId } as Record<string, unknown>, {
          $set: { [fieldPath]: deserializedValue },
        });

        const response: UpdateFieldResponse = {
          success: result.modifiedCount > 0 || result.matchedCount > 0,
          modifiedCount: result.modifiedCount,
        };

        return reply.send(response);
      } catch (e) {
        if (isConnectionError(e)) {
          await handleConnectionError(pool, id, reply, e, 'DatabaseError');
          return;
        }
        throw e;
      }
    }
  );

  // Delete a document by _id
  fastify.delete<{ Params: { id: string }; Body: DeleteDocumentRequest }>(
    '/connections/:id/documents',
    async (request, reply) => {
      const { id } = request.params;
      const { database, collection, documentId } = request.body;

      if (!database || !collection || documentId === undefined) {
        return reply.status(400).send({
          error: 'ValidationError',
          message: 'Missing required fields: database, collection, documentId',
          statusCode: 400,
        });
      }

      if (!requireConnection(pool, id, reply)) return;
      const db = requireDatabase(pool, id, database, reply);
      if (!db) return;

      const deserializedId = deserializeValue(documentId);

      try {
        const col = db.collection(collection);
        const result = await col.deleteOne({ _id: deserializedId } as Record<string, unknown>);

        const response: DeleteDocumentResponse = {
          success: result.deletedCount > 0,
          deletedCount: result.deletedCount,
        };

        return reply.send(response);
      } catch (e) {
        if (isConnectionError(e)) {
          await handleConnectionError(pool, id, reply, e, 'DatabaseError');
          return;
        }
        throw e;
      }
    }
  );
}
