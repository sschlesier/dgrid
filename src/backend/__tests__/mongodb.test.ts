import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createConnectionPool } from '../db/mongodb.js';

describe('MongoDB Connection Pool', () => {
  let mongod: MongoMemoryServer;
  let mongoUri: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    mongoUri = mongod.getUri();
  });

  afterAll(async () => {
    await mongod.stop();
  });

  describe('connect', () => {
    it('connects to MongoDB with valid URI', async () => {
      const pool = createConnectionPool();

      await pool.connect('test', { uri: mongoUri });

      expect(pool.isConnected('test')).toBe(true);

      await pool.disconnectAll();
    });

    it('throws error when connecting with duplicate id', async () => {
      const pool = createConnectionPool();

      await pool.connect('test', { uri: mongoUri });

      await expect(pool.connect('test', { uri: mongoUri })).rejects.toThrow(
        "Connection 'test' already exists"
      );

      await pool.disconnectAll();
    });

    it('throws error for invalid URI', async () => {
      const pool = createConnectionPool();

      await expect(
        pool.connect('test', {
          uri: 'mongodb://invalid:12345/?serverSelectionTimeoutMS=500',
        })
      ).rejects.toThrow();
    });
  });

  describe('disconnect', () => {
    it('disconnects existing connection', async () => {
      const pool = createConnectionPool();

      await pool.connect('test', { uri: mongoUri });
      expect(pool.isConnected('test')).toBe(true);

      await pool.disconnect('test');
      expect(pool.isConnected('test')).toBe(false);
    });

    it('throws error when disconnecting non-existent connection', async () => {
      const pool = createConnectionPool();

      await expect(pool.disconnect('nonexistent')).rejects.toThrow(
        "Connection 'nonexistent' not found"
      );
    });
  });

  describe('getClient', () => {
    it('returns client for connected id', async () => {
      const pool = createConnectionPool();

      await pool.connect('test', { uri: mongoUri });
      const client = pool.getClient('test');

      expect(client).toBeDefined();

      await pool.disconnectAll();
    });

    it('returns undefined for non-existent id', () => {
      const pool = createConnectionPool();

      const client = pool.getClient('nonexistent');

      expect(client).toBeUndefined();
    });
  });

  describe('getDb', () => {
    it('returns database when dbName provided', async () => {
      const pool = createConnectionPool();

      await pool.connect('test', { uri: mongoUri });
      const db = pool.getDb('test', 'mydb');

      expect(db).toBeDefined();
      expect(db?.databaseName).toBe('mydb');

      await pool.disconnectAll();
    });

    it('returns database from options when no dbName provided', async () => {
      const pool = createConnectionPool();

      await pool.connect('test', { uri: mongoUri, database: 'defaultdb' });
      const db = pool.getDb('test');

      expect(db).toBeDefined();
      expect(db?.databaseName).toBe('defaultdb');

      await pool.disconnectAll();
    });

    it('returns undefined when no database specified', async () => {
      const pool = createConnectionPool();

      await pool.connect('test', { uri: mongoUri });
      const db = pool.getDb('test');

      expect(db).toBeUndefined();

      await pool.disconnectAll();
    });

    it('returns undefined for non-existent connection', () => {
      const pool = createConnectionPool();

      const db = pool.getDb('nonexistent');

      expect(db).toBeUndefined();
    });
  });

  describe('listConnections', () => {
    it('returns empty array when no connections', () => {
      const pool = createConnectionPool();

      expect(pool.listConnections()).toEqual([]);
    });

    it('returns all connection ids', async () => {
      const pool = createConnectionPool();

      await pool.connect('conn1', { uri: mongoUri });
      await pool.connect('conn2', { uri: mongoUri });

      const connections = pool.listConnections();

      expect(connections).toContain('conn1');
      expect(connections).toContain('conn2');
      expect(connections).toHaveLength(2);

      await pool.disconnectAll();
    });
  });

  describe('disconnectAll', () => {
    it('disconnects all connections', async () => {
      const pool = createConnectionPool();

      await pool.connect('conn1', { uri: mongoUri });
      await pool.connect('conn2', { uri: mongoUri });

      expect(pool.listConnections()).toHaveLength(2);

      await pool.disconnectAll();

      expect(pool.listConnections()).toHaveLength(0);
    });

    it('handles empty pool gracefully', async () => {
      const pool = createConnectionPool();

      await expect(pool.disconnectAll()).resolves.toBeUndefined();
    });
  });

  describe('database operations', () => {
    let pool: ReturnType<typeof createConnectionPool>;

    beforeEach(async () => {
      pool = createConnectionPool();
      await pool.connect('test', { uri: mongoUri, database: 'testdb' });
    });

    afterAll(async () => {
      await pool.disconnectAll();
    });

    it('can perform CRUD operations', async () => {
      const db = pool.getDb('test');
      expect(db).toBeDefined();

      const collection = db!.collection('users');

      // Insert
      const insertResult = await collection.insertOne({ name: 'Test User' });
      expect(insertResult.insertedId).toBeDefined();

      // Find
      const user = await collection.findOne({ name: 'Test User' });
      expect(user).toBeDefined();
      expect(user?.name).toBe('Test User');

      // Update
      await collection.updateOne({ name: 'Test User' }, { $set: { name: 'Updated User' } });
      const updatedUser = await collection.findOne({ _id: insertResult.insertedId });
      expect(updatedUser?.name).toBe('Updated User');

      // Delete
      await collection.deleteOne({ _id: insertResult.insertedId });
      const deletedUser = await collection.findOne({ _id: insertResult.insertedId });
      expect(deletedUser).toBeNull();
    });
  });
});
