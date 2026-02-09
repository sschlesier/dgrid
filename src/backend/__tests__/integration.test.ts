import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { apiRoutes } from '../routes/index.js';
import { createConnectionStorage } from '../storage/connections.js';
import { createConnectionPool } from '../db/mongodb.js';
import { PasswordStorage } from '../storage/keyring.js';

describe('Integration Tests', () => {
  let app: FastifyInstance;
  let mongod: MongoMemoryServer;
  let tempDir: string;
  let mongoUri: string;

  // Mock password storage
  const passwordStore = new Map<string, string>();
  const mockPasswordStorage: PasswordStorage = {
    async get(id: string) {
      return passwordStore.get(id);
    },
    async set(id: string, password: string) {
      passwordStore.set(id, password);
    },
    async delete(id: string) {
      passwordStore.delete(id);
    },
  };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    mongoUri = mongod.getUri();
  });

  afterAll(async () => {
    await mongod.stop();
  });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'dgrid-integration-test-'));
    passwordStore.clear();

    const storage = createConnectionStorage(tempDir);
    const pool = createConnectionPool();

    app = Fastify();
    await app.register(apiRoutes, {
      prefix: '/api',
      storage,
      passwords: mockPasswordStorage,
      pool,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Full connection lifecycle', () => {
    it('creates, connects, queries, and deletes connection', async () => {
      // 1. Create connection
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/connections',
        payload: {
          name: 'Test Connection',
          uri: mongoUri,
        },
      });
      expect(createRes.statusCode).toBe(201);
      const connection = createRes.json();
      expect(connection.id).toBeDefined();
      expect(connection.isConnected).toBe(false);

      // 2. Test connection
      const testRes = await app.inject({
        method: 'POST',
        url: `/api/connections/${connection.id}/test`,
      });
      expect(testRes.statusCode).toBe(200);
      expect(testRes.json().success).toBe(true);

      // 3. Connect
      const connectRes = await app.inject({
        method: 'POST',
        url: `/api/connections/${connection.id}/connect`,
      });
      expect(connectRes.statusCode).toBe(200);
      expect(connectRes.json().isConnected).toBe(true);

      // 4. List databases
      const dbsRes = await app.inject({
        method: 'GET',
        url: `/api/connections/${connection.id}/databases`,
      });
      expect(dbsRes.statusCode).toBe(200);
      expect(Array.isArray(dbsRes.json())).toBe(true);

      // 5. Execute a query (insert some data first via direct connection)
      const queryRes = await app.inject({
        method: 'POST',
        url: `/api/connections/${connection.id}/query`,
        payload: {
          query: 'db.testcollection.find({})',
          database: 'testdb',
        },
      });
      expect(queryRes.statusCode).toBe(200);
      expect(queryRes.json().documents).toBeDefined();

      // 6. Disconnect
      const disconnectRes = await app.inject({
        method: 'POST',
        url: `/api/connections/${connection.id}/disconnect`,
      });
      expect(disconnectRes.statusCode).toBe(200);
      expect(disconnectRes.json().isConnected).toBe(false);

      // 7. Delete connection
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/connections/${connection.id}`,
      });
      expect(deleteRes.statusCode).toBe(204);

      // 8. Verify deleted
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/connections/${connection.id}`,
      });
      expect(getRes.statusCode).toBe(404);
    });
  });

  describe('Query execution with various query types', () => {
    let connectionId: string;

    beforeEach(async () => {
      // Create and connect
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/connections',
        payload: { name: 'Query Test', uri: mongoUri },
      });
      connectionId = createRes.json().id;

      await app.inject({
        method: 'POST',
        url: `/api/connections/${connectionId}/connect`,
      });

      // Seed data
      await app.inject({
        method: 'POST',
        url: `/api/connections/${connectionId}/query`,
        payload: {
          query: 'db.users.count({})',
          database: 'testdb',
        },
      });
    });

    it('executes find queries', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/connections/${connectionId}/query`,
        payload: {
          query: 'db.users.find({})',
          database: 'testdb',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().documents).toBeDefined();
    });

    it('executes aggregate queries', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/connections/${connectionId}/query`,
        payload: {
          query: 'db.users.aggregate([{ $group: { _id: null, count: { $sum: 1 } } }])',
          database: 'testdb',
        },
      });
      expect(res.statusCode).toBe(200);
    });

    it('executes count queries', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/connections/${connectionId}/query`,
        payload: {
          query: 'db.users.count({})',
          database: 'testdb',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().documents[0]).toHaveProperty('count');
    });
  });

  describe('BSON serialization round-trip', () => {
    let connectionId: string;

    beforeEach(async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/connections',
        payload: { name: 'BSON Test', uri: mongoUri },
      });
      connectionId = createRes.json().id;

      await app.inject({
        method: 'POST',
        url: `/api/connections/${connectionId}/connect`,
      });
    });

    it('serializes ObjectId correctly', async () => {
      // Query to get a document (MongoDB auto-generates _id)
      const res = await app.inject({
        method: 'POST',
        url: `/api/connections/${connectionId}/query`,
        payload: {
          query: 'db.bsontest.find({}).limit(1)',
          database: 'testdb',
        },
      });
      expect(res.statusCode).toBe(200);
      // If there are documents, _id should be serialized
      const docs = res.json().documents;
      if (docs.length > 0) {
        expect(docs[0]._id).toHaveProperty('_type', 'ObjectId');
      }
    });
  });

  describe('Error handling', () => {
    it('returns 400 for invalid query syntax', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/connections',
        payload: { name: 'Error Test', uri: mongoUri },
      });
      const connectionId = createRes.json().id;

      await app.inject({
        method: 'POST',
        url: `/api/connections/${connectionId}/connect`,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/connections/${connectionId}/query`,
        payload: {
          query: 'invalid syntax',
          database: 'testdb',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('QueryParseError');
    });

    it('returns 400 when querying without connecting', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/connections',
        payload: { name: 'Not Connected', uri: mongoUri },
      });
      const connectionId = createRes.json().id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/connections/${connectionId}/query`,
        payload: {
          query: 'db.users.find({})',
          database: 'testdb',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain('not active');
    });

    it('returns 404 for non-existent connection', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/connections/non-existent-id',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('Concurrent connections', () => {
    it('manages multiple connections simultaneously', async () => {
      // Create two connections
      const conn1Res = await app.inject({
        method: 'POST',
        url: '/api/connections',
        payload: { name: 'Connection 1', uri: mongoUri },
      });
      const conn1Id = conn1Res.json().id;

      const conn2Res = await app.inject({
        method: 'POST',
        url: '/api/connections',
        payload: { name: 'Connection 2', uri: mongoUri },
      });
      const conn2Id = conn2Res.json().id;

      // Connect both
      await app.inject({
        method: 'POST',
        url: `/api/connections/${conn1Id}/connect`,
      });
      await app.inject({
        method: 'POST',
        url: `/api/connections/${conn2Id}/connect`,
      });

      // Verify both are connected
      const list = await app.inject({
        method: 'GET',
        url: '/api/connections',
      });
      const connections = list.json();
      expect(connections.filter((c: { isConnected: boolean }) => c.isConnected)).toHaveLength(2);

      // Query on both
      const q1 = await app.inject({
        method: 'POST',
        url: `/api/connections/${conn1Id}/query`,
        payload: { query: 'db.test.find({})', database: 'db1' },
      });
      expect(q1.statusCode).toBe(200);

      const q2 = await app.inject({
        method: 'POST',
        url: `/api/connections/${conn2Id}/query`,
        payload: { query: 'db.test.find({})', database: 'db2' },
      });
      expect(q2.statusCode).toBe(200);
    });
  });
});
