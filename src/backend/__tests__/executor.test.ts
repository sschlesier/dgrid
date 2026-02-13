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

  describe('findOne queries', () => {
    beforeEach(async () => {
      await db.collection('users').insertMany([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);
    });

    it('returns a single document', async () => {
      const parsed = parseQuery('db.users.findOne({ name: "Alice" })');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents).toHaveLength(1);
        expect(result.value.documents[0].name).toBe('Alice');
        expect(result.value.totalCount).toBe(1);
        expect(result.value.hasMore).toBe(false);
      }
    });

    it('returns empty array when no match', async () => {
      const parsed = parseQuery('db.users.findOne({ name: "NonExistent" })');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents).toHaveLength(0);
        expect(result.value.totalCount).toBe(0);
      }
    });

    it('respects projection', async () => {
      const parsed = parseQuery('db.users.findOne({ name: "Alice" }, { name: 1, _id: 0 })');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0]).toEqual({ name: 'Alice' });
      }
    });
  });

  describe('insertOne', () => {
    it('inserts a document and returns result', async () => {
      const parsed = parseQuery('db.items.insertOne({ name: "Widget", price: 9.99 })');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].acknowledged).toBe(true);
        expect(result.value.documents[0].insertedId).toBeDefined();
        expect(result.value.hasMore).toBe(false);
      }

      // Verify the document was actually inserted
      const doc = await db.collection('items').findOne({ name: 'Widget' });
      expect(doc).not.toBeNull();
      expect(doc?.price).toBe(9.99);
    });
  });

  describe('insertMany', () => {
    it('inserts multiple documents and returns result', async () => {
      const parsed = parseQuery(
        'db.items.insertMany([{ name: "A" }, { name: "B" }, { name: "C" }])'
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].acknowledged).toBe(true);
        expect(result.value.documents[0].insertedCount).toBe(3);
      }

      const count = await db.collection('items').countDocuments();
      expect(count).toBe(3);
    });
  });

  describe('updateOne', () => {
    beforeEach(async () => {
      await db.collection('users').insertMany([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);
    });

    it('updates a single document', async () => {
      const parsed = parseQuery('db.users.updateOne({ name: "Alice" }, { $set: { age: 31 } })');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].acknowledged).toBe(true);
        expect(result.value.documents[0].matchedCount).toBe(1);
        expect(result.value.documents[0].modifiedCount).toBe(1);
      }

      const doc = await db.collection('users').findOne({ name: 'Alice' });
      expect(doc?.age).toBe(31);
    });

    it('supports upsert option', async () => {
      const parsed = parseQuery(
        'db.users.updateOne({ name: "Charlie" }, { $set: { age: 40 } }, { upsert: true })'
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].upsertedCount).toBe(1);
        expect(result.value.documents[0].upsertedId).toBeDefined();
      }
    });
  });

  describe('updateMany', () => {
    beforeEach(async () => {
      await db.collection('users').insertMany([
        { name: 'Alice', active: true },
        { name: 'Bob', active: true },
        { name: 'Charlie', active: false },
      ]);
    });

    it('updates multiple documents', async () => {
      const parsed = parseQuery(
        'db.users.updateMany({ active: true }, { $set: { verified: true } })'
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].matchedCount).toBe(2);
        expect(result.value.documents[0].modifiedCount).toBe(2);
      }
    });
  });

  describe('replaceOne', () => {
    beforeEach(async () => {
      await db.collection('users').insertMany([{ name: 'Alice', age: 30, role: 'user' }]);
    });

    it('replaces a document', async () => {
      const parsed = parseQuery(
        'db.users.replaceOne({ name: "Alice" }, { name: "Alice", age: 31, role: "admin" })'
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].acknowledged).toBe(true);
        expect(result.value.documents[0].matchedCount).toBe(1);
        expect(result.value.documents[0].modifiedCount).toBe(1);
      }

      const doc = await db.collection('users').findOne({ name: 'Alice' });
      expect(doc?.role).toBe('admin');
      expect(doc?.age).toBe(31);
    });
  });

  describe('deleteOne', () => {
    beforeEach(async () => {
      await db.collection('users').insertMany([{ name: 'Alice' }, { name: 'Bob' }]);
    });

    it('deletes a single document', async () => {
      const parsed = parseQuery('db.users.deleteOne({ name: "Alice" })');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].acknowledged).toBe(true);
        expect(result.value.documents[0].deletedCount).toBe(1);
      }

      const count = await db.collection('users').countDocuments();
      expect(count).toBe(1);
    });
  });

  describe('deleteMany', () => {
    beforeEach(async () => {
      await db.collection('users').insertMany([
        { name: 'Alice', active: false },
        { name: 'Bob', active: false },
        { name: 'Charlie', active: true },
      ]);
    });

    it('deletes multiple documents', async () => {
      const parsed = parseQuery('db.users.deleteMany({ active: false })');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].acknowledged).toBe(true);
        expect(result.value.documents[0].deletedCount).toBe(2);
      }

      const count = await db.collection('users').countDocuments();
      expect(count).toBe(1);
    });
  });

  describe('findOneAndUpdate', () => {
    beforeEach(async () => {
      await db.collection('users').insertMany([{ name: 'Alice', age: 30 }]);
    });

    it('returns the original document by default', async () => {
      const parsed = parseQuery(
        'db.users.findOneAndUpdate({ name: "Alice" }, { $set: { age: 31 } })'
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].name).toBe('Alice');
        expect(result.value.documents[0].age).toBe(30); // before update
      }
    });

    it('returns {value: null} when no match', async () => {
      const parsed = parseQuery(
        'db.users.findOneAndUpdate({ name: "NonExistent" }, { $set: { age: 99 } })'
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0]).toEqual({ value: null });
      }
    });
  });

  describe('findOneAndReplace', () => {
    beforeEach(async () => {
      await db.collection('users').insertMany([{ name: 'Alice', age: 30 }]);
    });

    it('replaces and returns document', async () => {
      const parsed = parseQuery(
        'db.users.findOneAndReplace({ name: "Alice" }, { name: "Alice", age: 31 })'
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].name).toBe('Alice');
        expect(result.value.documents[0].age).toBe(30); // before replace
      }

      const doc = await db.collection('users').findOne({ name: 'Alice' });
      expect(doc?.age).toBe(31);
    });
  });

  describe('findOneAndDelete', () => {
    beforeEach(async () => {
      await db.collection('users').insertMany([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);
    });

    it('deletes and returns the document', async () => {
      const parsed = parseQuery('db.users.findOneAndDelete({ name: "Alice" })');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].name).toBe('Alice');
        expect(result.value.documents[0].age).toBe(30);
      }

      const count = await db.collection('users').countDocuments();
      expect(count).toBe(1);
    });
  });

  describe('index operations', () => {
    it('creates and lists indexes', async () => {
      // Ensure collection exists
      await db.collection('indextest').insertOne({ email: 'test@example.com' });

      const createParsed = parseQuery('db.indextest.createIndex({ email: 1 }, { unique: true })');
      expect(createParsed.ok).toBe(true);
      if (!createParsed.ok) return;

      const createResult = await executeQuery(db, createParsed.value);

      expect(createResult.ok).toBe(true);
      if (createResult.ok) {
        expect(createResult.value.documents[0].indexName).toBe('email_1');
      }

      // List indexes
      const listParsed = parseQuery('db.indextest.getIndexes()');
      expect(listParsed.ok).toBe(true);
      if (!listParsed.ok) return;

      const listResult = await executeQuery(db, listParsed.value);

      expect(listResult.ok).toBe(true);
      if (listResult.ok) {
        expect(listResult.value.documents.length).toBeGreaterThanOrEqual(2); // _id + email
        const emailIndex = listResult.value.documents.find((d) => d.name === 'email_1');
        expect(emailIndex).toBeDefined();
      }
    });

    it('drops an index', async () => {
      await db.collection('droptest').insertOne({ field: 'value' });
      await db.collection('droptest').createIndex({ field: 1 });

      const parsed = parseQuery('db.droptest.dropIndex("field_1")');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].ok).toBe(1);
      }

      const indexes = await db.collection('droptest').indexes();
      const fieldIndex = indexes.find((i) => i.name === 'field_1');
      expect(fieldIndex).toBeUndefined();
    });
  });

  describe('bulkWrite', () => {
    it('executes bulk operations', async () => {
      await db.collection('bulk').insertMany([{ name: 'Alice' }, { name: 'Bob' }]);

      const parsed = parseQuery(
        'db.bulk.bulkWrite([{ insertOne: { document: { name: "Charlie" } } }, { deleteOne: { filter: { name: "Bob" } } }])'
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeQuery(db, parsed.value);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents[0].insertedCount).toBe(1);
        expect(result.value.documents[0].deletedCount).toBe(1);
      }

      const docs = await db.collection('bulk').find({}).toArray();
      expect(docs).toHaveLength(2);
      const names = docs.map((d) => d.name);
      expect(names).toContain('Alice');
      expect(names).toContain('Charlie');
      expect(names).not.toContain('Bob');
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
