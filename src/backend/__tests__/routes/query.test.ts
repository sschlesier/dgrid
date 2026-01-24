import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { queryRoutes } from '../../routes/query.js';
import { createConnectionPool, ConnectionPool } from '../../db/mongodb.js';

describe('Query Routes', () => {
  let app: FastifyInstance;
  let mongod: MongoMemoryServer;
  let pool: ConnectionPool;
  let mongoUri: string;
  const connectionId = 'test-conn';

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    mongoUri = mongod.getUri();
  });

  afterAll(async () => {
    await mongod.stop();
  });

  beforeEach(async () => {
    pool = createConnectionPool();
    await pool.connect(connectionId, { uri: mongoUri, database: 'testdb' });

    // Clear and seed data
    const client = pool.getClient(connectionId);
    if (client) {
      const db = client.db('testdb');
      const collections = await db.listCollections().toArray();
      for (const coll of collections) {
        await db.dropCollection(coll.name);
      }

      await db.collection('users').insertMany([
        { name: 'Alice', age: 30, role: 'admin' },
        { name: 'Bob', age: 25, role: 'user' },
        { name: 'Charlie', age: 35, role: 'user' },
      ]);
    }

    app = Fastify();
    await app.register(queryRoutes, { pool });
    await app.ready();
  });

  afterEach(async () => {
    await pool?.disconnectAll();
    await app?.close();
  });

  describe('POST /connections/:id/query', () => {
    it('executes find query', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/connections/${connectionId}/query`,
        payload: {
          query: 'db.users.find({})',
          database: 'testdb',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.documents).toHaveLength(3);
      expect(result.totalCount).toBe(3);
      expect(result.hasMore).toBe(false);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('executes find with filter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/connections/${connectionId}/query`,
        payload: {
          query: 'db.users.find({ role: "admin" })',
          database: 'testdb',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].name).toBe('Alice');
    });

    it('executes aggregate query', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/connections/${connectionId}/query`,
        payload: {
          query: 'db.users.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }])',
          database: 'testdb',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.documents.length).toBeGreaterThan(0);
    });

    it('executes count query', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/connections/${connectionId}/query`,
        payload: {
          query: 'db.users.count({ role: "user" })',
          database: 'testdb',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.documents[0].count).toBe(2);
    });

    it('serializes ObjectId in response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/connections/${connectionId}/query`,
        payload: {
          query: 'db.users.find({}).limit(1)',
          database: 'testdb',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.documents[0]._id).toHaveProperty('_type', 'ObjectId');
      expect(result.documents[0]._id).toHaveProperty('_value');
    });

    it('returns pagination info', async () => {
      // Add more documents
      const client = pool.getClient(connectionId);
      const db = client!.db('testdb');
      const docs = Array.from({ length: 100 }, (_, i) => ({
        name: `User ${i}`,
        index: i,
      }));
      await db.collection('users').insertMany(docs);

      const response = await app.inject({
        method: 'POST',
        url: `/connections/${connectionId}/query`,
        payload: {
          query: 'db.users.find({})',
          database: 'testdb',
          page: 1,
          pageSize: 50,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.documents).toHaveLength(50);
      expect(result.totalCount).toBe(103); // 3 original + 100 new
      expect(result.hasMore).toBe(true);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
    });

    it('returns 400 for invalid query syntax', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/connections/${connectionId}/query`,
        payload: {
          query: 'invalid query',
          database: 'testdb',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('QueryParseError');
    });

    it('returns 400 when connection not active', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/connections/non-existent/query',
        payload: {
          query: 'db.users.find({})',
          database: 'testdb',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('not active');
    });
  });
});
