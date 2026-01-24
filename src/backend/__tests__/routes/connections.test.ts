import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { connectionRoutes } from '../../routes/connections.js';
import { createConnectionStorage } from '../../storage/connections.js';
import { createConnectionPool } from '../../db/mongodb.js';
import { PasswordStorage } from '../../storage/keyring.js';

describe('Connection Routes', () => {
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
    tempDir = await mkdtemp(join(tmpdir(), 'dgrid-routes-test-'));
    passwordStore.clear();

    const storage = createConnectionStorage(tempDir);
    const pool = createConnectionPool();

    app = Fastify();
    await app.register(connectionRoutes, {
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

  describe('GET /', () => {
    it('returns empty array when no connections', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('returns all connections', async () => {
      // Create a connection first
      await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Test', host: 'localhost', port: 27017 },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const connections = response.json();
      expect(connections).toHaveLength(1);
      expect(connections[0].name).toBe('Test');
    });
  });

  describe('POST /', () => {
    it('creates a new connection', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          name: 'New Connection',
          host: 'localhost',
          port: 27017,
          database: 'mydb',
        },
      });

      expect(response.statusCode).toBe(201);
      const conn = response.json();
      expect(conn.id).toBeDefined();
      expect(conn.name).toBe('New Connection');
      expect(conn.host).toBe('localhost');
      expect(conn.port).toBe(27017);
      expect(conn.database).toBe('mydb');
      expect(conn.isConnected).toBe(false);
    });

    it('stores password in keyring', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          name: 'With Password',
          host: 'localhost',
          port: 27017,
          password: 'secret123',
        },
      });

      expect(response.statusCode).toBe(201);
      const conn = response.json();
      expect(passwordStore.get(conn.id)).toBe('secret123');
    });
  });

  describe('GET /:id', () => {
    it('returns connection by id', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Test', host: 'localhost', port: 27017 },
      });
      const created = createRes.json();

      const response = await app.inject({
        method: 'GET',
        url: `/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().id).toBe(created.id);
    });

    it('returns 404 for non-existent connection', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/non-existent-id',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /:id', () => {
    it('updates connection', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Original', host: 'localhost', port: 27017 },
      });
      const created = createRes.json();

      const response = await app.inject({
        method: 'PUT',
        url: `/${created.id}`,
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe('Updated');
    });

    it('updates password', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Test', host: 'localhost', port: 27017 },
      });
      const created = createRes.json();

      await app.inject({
        method: 'PUT',
        url: `/${created.id}`,
        payload: { password: 'newpassword' },
      });

      expect(passwordStore.get(created.id)).toBe('newpassword');
    });

    it('returns 404 for non-existent connection', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/non-existent-id',
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    it('deletes connection', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'To Delete', host: 'localhost', port: 27017 },
      });
      const created = createRes.json();

      const response = await app.inject({
        method: 'DELETE',
        url: `/${created.id}`,
      });

      expect(response.statusCode).toBe(204);

      // Verify deleted
      const getRes = await app.inject({
        method: 'GET',
        url: `/${created.id}`,
      });
      expect(getRes.statusCode).toBe(404);
    });

    it('deletes password from keyring', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          name: 'With Password',
          host: 'localhost',
          port: 27017,
          password: 'secret',
        },
      });
      const created = createRes.json();
      expect(passwordStore.has(created.id)).toBe(true);

      await app.inject({
        method: 'DELETE',
        url: `/${created.id}`,
      });

      expect(passwordStore.has(created.id)).toBe(false);
    });
  });

  describe('POST /:id/test', () => {
    it('tests connection successfully', async () => {
      // Parse the mongodb-memory-server URI
      const url = new URL(mongoUri);
      const host = url.hostname;
      const port = parseInt(url.port, 10);

      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Test Conn', host, port },
      });
      const created = createRes.json();

      const response = await app.inject({
        method: 'POST',
        url: `/${created.id}/test`,
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    // Skip: DNS resolution for invalid hosts can take longer than test timeout
    it.skip('returns failure for bad connection', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Bad Conn', host: 'invalid-host', port: 12345 },
      });
      const created = createRes.json();

      const response = await app.inject({
        method: 'POST',
        url: `/${created.id}/test`,
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe('POST /:id/connect and /:id/disconnect', () => {
    it('connects and disconnects', async () => {
      // Parse the mongodb-memory-server URI
      const url = new URL(mongoUri);
      const host = url.hostname;
      const port = parseInt(url.port, 10);

      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Live Conn', host, port },
      });
      const created = createRes.json();

      // Connect
      const connectRes = await app.inject({
        method: 'POST',
        url: `/${created.id}/connect`,
      });

      expect(connectRes.statusCode).toBe(200);
      expect(connectRes.json().isConnected).toBe(true);

      // Disconnect
      const disconnectRes = await app.inject({
        method: 'POST',
        url: `/${created.id}/disconnect`,
      });

      expect(disconnectRes.statusCode).toBe(200);
      expect(disconnectRes.json().isConnected).toBe(false);
    });

    it('returns error when already connected', async () => {
      const url = new URL(mongoUri);
      const host = url.hostname;
      const port = parseInt(url.port, 10);

      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Live Conn', host, port },
      });
      const created = createRes.json();

      // Connect first time
      await app.inject({
        method: 'POST',
        url: `/${created.id}/connect`,
      });

      // Try to connect again
      const response = await app.inject({
        method: 'POST',
        url: `/${created.id}/connect`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('already active');
    });

    it('returns error when not connected', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Test', host: 'localhost', port: 27017 },
      });
      const created = createRes.json();

      const response = await app.inject({
        method: 'POST',
        url: `/${created.id}/disconnect`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('not active');
    });
  });
});
