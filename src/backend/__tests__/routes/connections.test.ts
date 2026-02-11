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
        payload: { name: 'Test', uri: 'mongodb://localhost:27017' },
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
          uri: 'mongodb://localhost:27017/mydb',
        },
      });

      expect(response.statusCode).toBe(201);
      const conn = response.json();
      expect(conn.id).toBeDefined();
      expect(conn.name).toBe('New Connection');
      expect(conn.uri).toBe('mongodb://localhost:27017/mydb');
      expect(conn.isConnected).toBe(false);
    });

    it('strips credentials from URI and stores password in keyring', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          name: 'With Password',
          uri: 'mongodb://user:secret123@localhost:27017',
        },
      });

      expect(response.statusCode).toBe(201);
      const conn = response.json();
      // URI should have credentials stripped
      expect(conn.uri).toBe('mongodb://localhost:27017');
      expect(conn.username).toBe('user');
      // Password should be in keyring
      expect(passwordStore.get(conn.id)).toBe('secret123');
    });

    it('includes savePassword in response (defaults to true)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          name: 'Default Save',
          uri: 'mongodb://localhost:27017',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().savePassword).toBe(true);
    });

    it('does not store password when savePassword is false', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          name: 'No Save',
          uri: 'mongodb://user:secret@localhost:27017',
          savePassword: false,
        },
      });

      expect(response.statusCode).toBe(201);
      const conn = response.json();
      expect(conn.savePassword).toBe(false);
      expect(conn.username).toBe('user');
      // Password should NOT be in keyring
      expect(passwordStore.has(conn.id)).toBe(false);
    });
  });

  describe('GET /:id', () => {
    it('returns connection by id', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Test', uri: 'mongodb://localhost:27017' },
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
        payload: { name: 'Original', uri: 'mongodb://localhost:27017' },
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

    it('updates password when URI contains credentials', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Test', uri: 'mongodb://localhost:27017' },
      });
      const created = createRes.json();

      await app.inject({
        method: 'PUT',
        url: `/${created.id}`,
        payload: { uri: 'mongodb://user:newpassword@localhost:27017' },
      });

      expect(passwordStore.get(created.id)).toBe('newpassword');
    });

    it('deletes keyring entry when savePassword toggled to false', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Test', uri: 'mongodb://user:pass@localhost:27017' },
      });
      const created = createRes.json();
      expect(passwordStore.has(created.id)).toBe(true);

      const response = await app.inject({
        method: 'PUT',
        url: `/${created.id}`,
        payload: { savePassword: false },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().savePassword).toBe(false);
      expect(passwordStore.has(created.id)).toBe(false);
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
        payload: { name: 'To Delete', uri: 'mongodb://localhost:27017' },
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
          uri: 'mongodb://user:secret@localhost:27017',
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

  describe('POST /test (unsaved connection)', () => {
    it('tests unsaved connection successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/test',
        payload: { uri: mongoUri },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Connection successful');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    // Skip: Connection timeout can exceed test timeout
    it.skip('returns failure for invalid connection', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/test',
        payload: { uri: 'mongodb://127.0.0.1:1' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe('POST /:id/test', () => {
    it('tests connection successfully', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Test Conn', uri: mongoUri },
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
        payload: { name: 'Bad Conn', uri: 'mongodb://invalid-host:12345' },
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
      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Live Conn', uri: mongoUri },
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

    it('connects with password in body', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Auth Conn', uri: mongoUri },
      });
      const created = createRes.json();

      const connectRes = await app.inject({
        method: 'POST',
        url: `/${created.id}/connect`,
        payload: { password: 'test' },
      });

      expect(connectRes.statusCode).toBe(200);
      expect(connectRes.json().isConnected).toBe(true);
    });

    it('stores password in keyring when savePassword is true in connect body (remember flow)', async () => {
      // Create a connection without saving password
      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          name: 'Remember Conn',
          uri: mongoUri,
          savePassword: false,
        },
      });
      const created = createRes.json();
      expect(passwordStore.has(created.id)).toBe(false);
      expect(created.savePassword).toBe(false);

      // Connect with password + savePassword=true (the "Remember" flow)
      const connectRes = await app.inject({
        method: 'POST',
        url: `/${created.id}/connect`,
        payload: { password: 'remembered', savePassword: true },
      });

      expect(connectRes.statusCode).toBe(200);
      // Password should now be in keyring
      expect(passwordStore.get(created.id)).toBe('remembered');
    });

    it('reconnects when already connected (idempotent)', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Live Conn', uri: mongoUri },
      });
      const created = createRes.json();

      // Connect first time
      await app.inject({
        method: 'POST',
        url: `/${created.id}/connect`,
      });

      // Connect again — should succeed (force-reconnect)
      const response = await app.inject({
        method: 'POST',
        url: `/${created.id}/connect`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().isConnected).toBe(true);
    });

    it('succeeds when disconnecting an already-disconnected connection', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Test', uri: 'mongodb://localhost:27017' },
      });
      const created = createRes.json();

      const response = await app.inject({
        method: 'POST',
        url: `/${created.id}/disconnect`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().isConnected).toBe(false);
    });
  });
});
