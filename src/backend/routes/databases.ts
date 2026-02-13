import { FastifyInstance } from 'fastify';
import { Db } from 'mongodb';
import { ConnectionPool } from '../db/mongodb.js';
import { DatabaseInfo, CollectionInfo, CollectionSchemaResponse } from '../../shared/contracts.js';
import { collectColumns } from '../db/csv.js';
import { requireConnection, requireClient, handleConnectionError } from './guards.js';

export interface DatabaseRoutesOptions {
  pool: ConnectionPool;
}

interface CollStats {
  storageStats: {
    count: number;
    avgObjSize: number;
    size: number;
  };
}

async function getCollectionStats(
  db: Db,
  collectionName: string
): Promise<{ count: number; avgObjSize: number; size: number }> {
  try {
    const result = await db
      .collection(collectionName)
      .aggregate<CollStats>([{ $collStats: { storageStats: {} } }])
      .toArray();

    if (result.length > 0 && result[0].storageStats) {
      return {
        count: result[0].storageStats.count ?? 0,
        avgObjSize: result[0].storageStats.avgObjSize ?? 0,
        size: result[0].storageStats.size ?? 0,
      };
    }
  } catch {
    // Fall back to countDocuments if $collStats fails
  }

  // Fallback: just get document count
  const count = await db.collection(collectionName).countDocuments();
  return { count, avgObjSize: 0, size: 0 };
}

export async function databaseRoutes(
  fastify: FastifyInstance,
  opts: DatabaseRoutesOptions
): Promise<void> {
  const { pool } = opts;

  // List databases for a connection
  fastify.get<{ Params: { id: string } }>('/connections/:id/databases', async (request, reply) => {
    const { id } = request.params;

    if (!requireConnection(pool, id, reply)) return;
    const client = requireClient(pool, id, reply);
    if (!client) return;

    try {
      const adminDb = client.db('admin');
      const result = await adminDb.command({ listDatabases: 1 });

      const databases: DatabaseInfo[] = result.databases.map(
        (db: { name: string; sizeOnDisk: number; empty: boolean }) => ({
          name: db.name,
          sizeOnDisk: db.sizeOnDisk,
          empty: db.empty,
        })
      );

      return reply.send(databases);
    } catch (e) {
      await handleConnectionError(pool, id, reply, e, 'DatabaseError');
    }
  });

  // List collections for a database
  fastify.get<{ Params: { id: string; db: string } }>(
    '/connections/:id/databases/:db/collections',
    async (request, reply) => {
      const { id, db: dbName } = request.params;

      if (!requireConnection(pool, id, reply)) return;
      const client = requireClient(pool, id, reply);
      if (!client) return;

      try {
        const db = client.db(dbName);
        const collections = await db.listCollections().toArray();

        const collectionInfos: CollectionInfo[] = await Promise.all(
          collections.map(async (coll) => {
            const stats = await getCollectionStats(db, coll.name);
            const indexes = await db.collection(coll.name).indexes();

            return {
              name: coll.name,
              type: coll.type === 'view' ? 'view' : 'collection',
              documentCount: stats.count,
              avgDocumentSize: stats.avgObjSize,
              totalSize: stats.size,
              indexes: indexes.length,
            } as CollectionInfo;
          })
        );

        collectionInfos.sort((a, b) => a.name.localeCompare(b.name));
        return reply.send(collectionInfos);
      } catch (e) {
        await handleConnectionError(pool, id, reply, e, 'DatabaseError');
      }
    }
  );

  // Get collection stats
  fastify.get<{ Params: { id: string; db: string; coll: string } }>(
    '/connections/:id/databases/:db/collections/:coll/stats',
    async (request, reply) => {
      const { id, db: dbName, coll: collName } = request.params;

      if (!requireConnection(pool, id, reply)) return;
      const client = requireClient(pool, id, reply);
      if (!client) return;

      try {
        const db = client.db(dbName);
        const [stats, indexes] = await Promise.all([
          getCollectionStats(db, collName),
          db.collection(collName).indexes(),
        ]);

        const info: CollectionInfo = {
          name: collName,
          type: 'collection',
          documentCount: stats.count,
          avgDocumentSize: stats.avgObjSize,
          totalSize: stats.size,
          indexes: indexes.length,
        };

        return reply.send(info);
      } catch (e) {
        await handleConnectionError(pool, id, reply, e, 'DatabaseError');
      }
    }
  );

  // Get collection schema (field names from sample)
  fastify.get<{ Params: { id: string; db: string; coll: string } }>(
    '/connections/:id/databases/:db/collections/:coll/schema',
    async (request, reply) => {
      const { id, db: dbName, coll: collName } = request.params;

      if (!requireConnection(pool, id, reply)) return;
      const client = requireClient(pool, id, reply);
      if (!client) return;

      try {
        const db = client.db(dbName);
        const docs = await db
          .collection(collName)
          .aggregate([{ $sample: { size: 100 } }])
          .toArray();

        const fields = collectColumns(docs);

        const result: CollectionSchemaResponse = {
          fields,
          sampleSize: docs.length,
        };

        return reply.send(result);
      } catch (e) {
        await handleConnectionError(pool, id, reply, e, 'DatabaseError');
      }
    }
  );
}
