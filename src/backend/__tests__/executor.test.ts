import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { parseQuery, executeQuery } from '../db/queries.js';

describe('Query Executor', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('testdb');
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    // Clear all collections before each test
    const collections = await db.listCollections().toArray();
    for (const coll of collections) {
      await db.collection(coll.name).deleteMany({});
    }
  });

  describe('find queries', () => {
    beforeEach(async () => {
      await db.collection('users').insertMany([
        { name: 'Alice', age: 30, role: 'admin' },
        { name: 'Bob', age: 25, role: 'user' },
        { name: 'Charlie', age: 35, role: 'user' },
        { name: 'Diana', age: 28, role: 'admin' },
      ]);
    });

    it('executes simple find query', async () => {
      const parsed = parseQuery('db.users.find({})');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents).toHaveLength(4);
        expect(result.value.totalCount).toBe(4);
        expect(result.value.hasMore).toBe(false);
        expect(result.value.executionTimeMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('executes find with filter', async () => {
      const parsed = parseQuery('db.users.find({ role: "admin" })');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents).toHaveLength(2);
        expect(result.value.totalCount).toBe(2);
      }
    });

    it('executes find with projection', async () => {
      const parsed = parseQuery('db.users.find({}, { name: 1, _id: 0 })');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0]).toHaveProperty('name');
        expect(result.value.documents[0]).not.toHaveProperty('age');
        expect(result.value.documents[0]).not.toHaveProperty('role');
      }
    });

    it('executes find with sort', async () => {
      const parsed = parseQuery('db.users.find({}).sort({ age: 1 })');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].name).toBe('Bob');
        expect(result.value.documents[3].name).toBe('Charlie');
      }
    });

    it('respects pagination', async () => {
      // Insert more documents for pagination test
      const docs = Array.from({ length: 100 }, (_, i) => ({
        name: `User ${i}`,
        index: i,
      }));
      await db.collection('users').insertMany(docs);

      const parsed = parseQuery('db.users.find({})');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      // First page
      const page1 = await executeQuery(db, parsed.value, { page: 1, pageSize: 50 });
      expect(page1.ok).toBe(true);
      if (page1.ok) {
        expect(page1.value.documents).toHaveLength(50);
        expect(page1.value.totalCount).toBe(104); // 4 from beforeEach + 100
        expect(page1.value.hasMore).toBe(true);
      }

      // Second page
      const page2 = await executeQuery(db, parsed.value, { page: 2, pageSize: 50 });
      expect(page2.ok).toBe(true);
      if (page2.ok) {
        expect(page2.value.documents).toHaveLength(50);
        expect(page2.value.hasMore).toBe(true);
      }

      // Third page (last)
      const page3 = await executeQuery(db, parsed.value, { page: 3, pageSize: 50 });
      expect(page3.ok).toBe(true);
      if (page3.ok) {
        expect(page3.value.documents).toHaveLength(4);
        expect(page3.value.hasMore).toBe(false);
      }
    });
  });

  describe('aggregate queries', () => {
    beforeEach(async () => {
      await db.collection('orders').insertMany([
        { customer: 'Alice', amount: 100 },
        { customer: 'Alice', amount: 200 },
        { customer: 'Bob', amount: 150 },
      ]);
    });

    it('executes aggregate pipeline', async () => {
      const parsed = parseQuery(
        'db.orders.aggregate([{ $group: { _id: "$customer", total: { $sum: "$amount" } } }])'
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents).toHaveLength(2);
        const aliceResult = result.value.documents.find((d) => d._id === 'Alice');
        expect(aliceResult?.total).toBe(300);
      }
    });

    it('executes aggregate with match stage', async () => {
      const parsed = parseQuery(
        'db.orders.aggregate([{ $match: { customer: "Alice" } }, { $group: { _id: null, total: { $sum: "$amount" } } }])'
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].total).toBe(300);
      }
    });
  });

  describe('count queries', () => {
    beforeEach(async () => {
      await db.collection('users').insertMany([
        { name: 'Alice', active: true },
        { name: 'Bob', active: true },
        { name: 'Charlie', active: false },
      ]);
    });

    it('executes count with filter', async () => {
      const parsed = parseQuery('db.users.count({ active: true })');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].count).toBe(2);
        expect(result.value.totalCount).toBe(1);
        expect(result.value.hasMore).toBe(false);
      }
    });

    it('executes count without filter', async () => {
      const parsed = parseQuery('db.users.count({})');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].count).toBe(3);
      }
    });
  });

  describe('distinct queries', () => {
    beforeEach(async () => {
      await db.collection('users').insertMany([
        { name: 'Alice', role: 'admin' },
        { name: 'Bob', role: 'user' },
        { name: 'Charlie', role: 'user' },
        { name: 'Diana', role: 'moderator' },
      ]);
    });

    it('executes distinct query', async () => {
      const parsed = parseQuery("db.users.distinct('role')");
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const values = result.value.documents.map((d) => d.value);
        expect(values).toContain('admin');
        expect(values).toContain('user');
        expect(values).toContain('moderator');
        expect(result.value.totalCount).toBe(3);
      }
    });

    it('executes distinct with filter', async () => {
      const parsed = parseQuery("db.users.distinct('name', { role: 'user' })");
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const values = result.value.documents.map((d) => d.value);
        expect(values).toContain('Bob');
        expect(values).toContain('Charlie');
        expect(values).not.toContain('Alice');
        expect(result.value.totalCount).toBe(2);
      }
    });
  });

  describe('execution time tracking', () => {
    it('tracks execution time', async () => {
      await db.collection('users').insertMany([{ name: 'Test' }]);

      const parsed = parseQuery('db.users.find({})');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value.executionTimeMs).toBe('number');
        expect(result.value.executionTimeMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('error handling', () => {
    it('returns error for invalid collection operation', async () => {
      const result = await executeQuery(db, {
        collection: 'users',
        operation: 'invalid' as 'find',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Unsupported operation');
      }
    });
  });
});
