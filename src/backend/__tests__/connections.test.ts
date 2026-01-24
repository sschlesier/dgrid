import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createConnectionStorage } from '../storage/connections.js';

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
      await storage.create({ name: 'Conn 1', host: 'localhost', port: 27017 });
      await storage.create({ name: 'Conn 2', host: 'localhost', port: 27018 });

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
        host: 'localhost',
        port: 27017,
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
        host: 'localhost',
        port: 27017,
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
        host: 'localhost',
        port: 27017,
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
        host: 'localhost',
        port: 27017,
        database: 'mydb',
        username: 'user',
        authSource: 'admin',
      });

      // Create new storage instance to verify persistence
      const newStorage = createConnectionStorage(tempDir);
      const retrieved = await newStorage.get(connection.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Persistent');
      expect(retrieved?.host).toBe('localhost');
      expect(retrieved?.port).toBe(27017);
      expect(retrieved?.database).toBe('mydb');
      expect(retrieved?.username).toBe('user');
      expect(retrieved?.authSource).toBe('admin');
    });

    it('creates data directory if it does not exist', async () => {
      const nestedDir = join(tempDir, 'nested', 'path');
      const nestedStorage = createConnectionStorage(nestedDir);

      const connection = await nestedStorage.create({
        name: 'Test',
        host: 'localhost',
        port: 27017,
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
        host: 'localhost',
        port: 27017,
      });

      const updated = await storage.update(created.id, {
        name: 'Updated',
        port: 27018,
      });

      expect(updated.name).toBe('Updated');
      expect(updated.port).toBe(27018);
      expect(updated.host).toBe('localhost'); // Unchanged
    });

    it('updates updatedAt timestamp', async () => {
      const created = await storage.create({
        name: 'Test',
        host: 'localhost',
        port: 27017,
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
        host: 'localhost',
        port: 27017,
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
        host: 'localhost',
        port: 27017,
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
        host: 'localhost',
        port: 27017,
      });

      await storage.delete(created.id);

      // Create new storage instance to verify persistence
      const newStorage = createConnectionStorage(tempDir);
      const connections = await newStorage.list();

      expect(connections).toHaveLength(0);
    });
  });
});
