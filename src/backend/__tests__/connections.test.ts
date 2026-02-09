import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createConnectionStorage } from '../storage/connections.js';
import { stripCredentials, injectCredentials } from '../routes/connections.js';

describe('Connection Storage', () => {
  let tempDir: string;
  let storage: ReturnType<typeof createConnectionStorage>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'dgrid-test-'));
    storage = createConnectionStorage(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('list', () => {
    it('returns empty array when no connections exist', async () => {
      const connections = await storage.list();
      expect(connections).toEqual([]);
    });

    it('returns all connections', async () => {
      await storage.create({ name: 'Conn 1', uri: 'mongodb://localhost:27017' });
      await storage.create({ name: 'Conn 2', uri: 'mongodb://localhost:27018' });

      const connections = await storage.list();
      expect(connections).toHaveLength(2);
      expect(connections[0].name).toBe('Conn 1');
      expect(connections[1].name).toBe('Conn 2');
    });
  });

  describe('get', () => {
    it('returns undefined for non-existent connection', async () => {
      const connection = await storage.get('non-existent');
      expect(connection).toBeUndefined();
    });

    it('returns connection by id', async () => {
      const created = await storage.create({
        name: 'Test',
        uri: 'mongodb://localhost:27017',
      });

      const connection = await storage.get(created.id);
      expect(connection).toBeDefined();
      expect(connection?.name).toBe('Test');
    });
  });

  describe('create', () => {
    it('creates connection with generated id', async () => {
      const connection = await storage.create({
        name: 'Test',
        uri: 'mongodb://localhost:27017',
      });

      expect(connection.id).toBeDefined();
      expect(connection.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('sets createdAt and updatedAt timestamps', async () => {
      const before = new Date().toISOString();

      const connection = await storage.create({
        name: 'Test',
        uri: 'mongodb://localhost:27017',
      });

      const after = new Date().toISOString();

      expect(connection.createdAt).toBeDefined();
      expect(connection.updatedAt).toBeDefined();
      expect(connection.createdAt >= before).toBe(true);
      expect(connection.createdAt <= after).toBe(true);
      expect(connection.createdAt).toBe(connection.updatedAt);
    });

    it('persists connection to storage', async () => {
      const connection = await storage.create({
        name: 'Persistent',
        uri: 'mongodb://localhost:27017/mydb',
        username: 'user',
      });

      // Create new storage instance to verify persistence
      const newStorage = createConnectionStorage(tempDir);
      const retrieved = await newStorage.get(connection.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Persistent');
      expect(retrieved?.uri).toBe('mongodb://localhost:27017/mydb');
      expect(retrieved?.username).toBe('user');
    });

    it('creates data directory if it does not exist', async () => {
      const nestedDir = join(tempDir, 'nested', 'path');
      const nestedStorage = createConnectionStorage(nestedDir);

      const connection = await nestedStorage.create({
        name: 'Test',
        uri: 'mongodb://localhost:27017',
      });

      expect(connection.id).toBeDefined();

      // Verify it was persisted
      const retrieved = await nestedStorage.get(connection.id);
      expect(retrieved).toBeDefined();
    });
  });

  describe('update', () => {
    it('updates connection fields', async () => {
      const created = await storage.create({
        name: 'Original',
        uri: 'mongodb://localhost:27017',
      });

      const updated = await storage.update(created.id, {
        name: 'Updated',
        uri: 'mongodb://localhost:27018',
      });

      expect(updated.name).toBe('Updated');
      expect(updated.uri).toBe('mongodb://localhost:27018');
    });

    it('updates updatedAt timestamp', async () => {
      const created = await storage.create({
        name: 'Test',
        uri: 'mongodb://localhost:27017',
      });

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await storage.update(created.id, { name: 'Updated' });

      expect(updated.updatedAt > created.updatedAt).toBe(true);
      expect(updated.createdAt).toBe(created.createdAt);
    });

    it('throws error for non-existent connection', async () => {
      await expect(storage.update('non-existent', { name: 'Updated' })).rejects.toThrow(
        "Connection 'non-existent' not found"
      );
    });

    it('persists updates', async () => {
      const created = await storage.create({
        name: 'Original',
        uri: 'mongodb://localhost:27017',
      });

      await storage.update(created.id, { name: 'Updated' });

      // Create new storage instance to verify persistence
      const newStorage = createConnectionStorage(tempDir);
      const retrieved = await newStorage.get(created.id);

      expect(retrieved?.name).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('deletes connection', async () => {
      const created = await storage.create({
        name: 'To Delete',
        uri: 'mongodb://localhost:27017',
      });

      await storage.delete(created.id);

      const retrieved = await storage.get(created.id);
      expect(retrieved).toBeUndefined();
    });

    it('throws error for non-existent connection', async () => {
      await expect(storage.delete('non-existent')).rejects.toThrow(
        "Connection 'non-existent' not found"
      );
    });

    it('persists deletion', async () => {
      const created = await storage.create({
        name: 'To Delete',
        uri: 'mongodb://localhost:27017',
      });

      await storage.delete(created.id);

      // Create new storage instance to verify persistence
      const newStorage = createConnectionStorage(tempDir);
      const connections = await newStorage.list();

      expect(connections).toHaveLength(0);
    });
  });

  describe('old format handling', () => {
    it('flags connections with host/port but no uri as old format', async () => {
      // Write an old-format connection file directly
      const filePath = join(tempDir, 'connections.json');
      const oldData = {
        version: 1,
        connections: [
          {
            id: 'old-conn-id',
            name: 'Old Connection',
            host: 'localhost',
            port: 27017,
            database: 'mydb',
            username: 'user',
            authSource: 'admin',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };
      await writeFile(filePath, JSON.stringify(oldData), 'utf-8');

      const connections = await storage.list();
      expect(connections).toHaveLength(1);
      expect(connections[0].error).toBe(
        'This connection uses an old format. Please delete and re-create it.'
      );
      expect(connections[0].uri).toBe('');
    });

    it('does not flag new-format connections as old', async () => {
      const conn = await storage.create({
        name: 'New Connection',
        uri: 'mongodb://localhost:27017',
      });

      const retrieved = await storage.get(conn.id);
      expect(retrieved?.error).toBeUndefined();
    });
  });
});

describe('URI Credential Helpers', () => {
  describe('stripCredentials', () => {
    it('extracts username and password from URI', () => {
      const result = stripCredentials('mongodb://user:pass@localhost:27017/mydb');
      expect(result.username).toBe('user');
      expect(result.password).toBe('pass');
      expect(result.strippedUri).toBe('mongodb://localhost:27017/mydb');
    });

    it('handles URI without credentials', () => {
      const result = stripCredentials('mongodb://localhost:27017/mydb');
      expect(result.username).toBe('');
      expect(result.password).toBe('');
      expect(result.strippedUri).toBe('mongodb://localhost:27017/mydb');
    });

    it('handles URI with only username', () => {
      const result = stripCredentials('mongodb://user@localhost:27017');
      expect(result.username).toBe('user');
      expect(result.password).toBe('');
    });

    it('handles SRV URI with credentials', () => {
      const result = stripCredentials('mongodb+srv://admin:secret@cluster0.example.net/testdb');
      expect(result.username).toBe('admin');
      expect(result.password).toBe('secret');
      expect(result.strippedUri).toBe('mongodb+srv://cluster0.example.net/testdb');
    });

    it('handles URL-encoded special characters in credentials', () => {
      const result = stripCredentials('mongodb://user%40domain:p%40ss%3Aword@localhost:27017');
      expect(result.username).toBe('user@domain');
      expect(result.password).toBe('p@ss:word');
      expect(result.strippedUri).toBe('mongodb://localhost:27017');
    });

    it('preserves query parameters', () => {
      const result = stripCredentials(
        'mongodb://user:pass@localhost:27017/mydb?authSource=admin&tls=true'
      );
      expect(result.strippedUri).toBe('mongodb://localhost:27017/mydb?authSource=admin&tls=true');
    });
  });

  describe('injectCredentials', () => {
    it('inserts username and password into stripped URI', () => {
      const result = injectCredentials('mongodb://localhost:27017/mydb', 'user', 'pass');
      expect(result).toBe('mongodb://user:pass@localhost:27017/mydb');
    });

    it('returns URI unchanged when username is empty', () => {
      const result = injectCredentials('mongodb://localhost:27017', '', '');
      expect(result).toBe('mongodb://localhost:27017');
    });

    it('handles username without password', () => {
      const result = injectCredentials('mongodb://localhost:27017', 'user', '');
      expect(result).toBe('mongodb://user@localhost:27017');
    });

    it('handles SRV URIs', () => {
      const result = injectCredentials(
        'mongodb+srv://cluster0.example.net/testdb',
        'admin',
        'secret'
      );
      expect(result).toBe('mongodb+srv://admin:secret@cluster0.example.net/testdb');
    });

    it('URL-encodes special characters in credentials', () => {
      const result = injectCredentials('mongodb://localhost:27017', 'user@domain', 'p@ss:word');
      expect(result).toBe('mongodb://user%40domain:p%40ss%3Aword@localhost:27017');
    });

    it('preserves query parameters', () => {
      const result = injectCredentials(
        'mongodb://localhost:27017/mydb?authSource=admin',
        'user',
        'pass'
      );
      expect(result).toBe('mongodb://user:pass@localhost:27017/mydb?authSource=admin');
    });
  });
});
