import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { databaseRoutes } from '../../routes/databases.js';
import { createConnectionPool, ConnectionPool } from '../../db/mongodb.js';

describe('Database Routes', () => {
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
      // Drop collections to start fresh
      const collections = await db.listCollections().toArray();
      for (const coll of collections) {
        await db.dropCollection(coll.name);
      }
      // Seed fresh data
      await db.collection('users').insertMany([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);
      await db.collection('orders').insertOne({ item: 'Widget', qty: 10 });
    }

    app = Fastify();
    await app.register(databaseRoutes, { pool });
    await app.ready();
  });

  afterEach(async () => {
    await pool?.disconnectAll();
    await app?.close();
  });

  describe('GET /connections/:id/databases', () => {
    it('returns list of databases', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/connections/${connectionId}/databases`,
      });

      expect(response.statusCode).toBe(200);
      const databases = response.json();
      expect(Array.isArray(databases)).toBe(true);

      const testDb = databases.find((d: { name: string }) => d.name === 'testdb');
      expect(testDb).toBeDefined();
      expect(testDb.sizeOnDisk).toBeGreaterThan(0);
    });

    it('returns 400 when connection not active', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/connections/non-existent/databases',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('not active');
    });
  });

  describe('GET /connections/:id/databases/:db/collections', () => {
    it('returns list of collections', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/connections/${connectionId}/databases/testdb/collections`,
      });

      expect(response.statusCode).toBe(200);
      const collections = response.json();
      expect(Array.isArray(collections)).toBe(true);
      expect(collections.length).toBeGreaterThanOrEqual(2);

      const usersCollection = collections.find((c: { name: string }) => c.name === 'users');
      expect(usersCollection).toBeDefined();
      expect(usersCollection.documentCount).toBe(2);
      expect(usersCollection.type).toBe('collection');
    });

    it('returns 400 when connection not active', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/connections/non-existent/databases/testdb/collections',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /connections/:id/databases/:db/collections/:coll/stats', () => {
    it('returns collection stats', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/connections/${connectionId}/databases/testdb/collections/users/stats`,
      });

      expect(response.statusCode).toBe(200);
      const stats = response.json();
      expect(stats.name).toBe('users');
      expect(stats.documentCount).toBe(2);
      expect(stats.indexes).toBeGreaterThanOrEqual(1); // _id index
    });

    it('returns 400 when connection not active', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/connections/non-existent/databases/testdb/collections/users/stats',
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
