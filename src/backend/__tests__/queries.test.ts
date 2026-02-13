import { describe, it, expect } from 'vitest';
import {
  parseQuery,
  parseDbCommand,
  detectQueryType,
  DB_COMMAND_SIGNATURES,
} from '../db/queries.js';

describe('Query Parser', () => {
  describe('find queries', () => {
    it('parses empty find', () => {
      const result = parseQuery('db.users.find({})');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.collection).toBe('users');
        expect(result.value.operation).toBe('find');
        expect(result.value.filter).toEqual({});
      }
    });

    it('parses find with filter', () => {
      const result = parseQuery('db.users.find({ age: { $gt: 21 } })');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({ age: { $gt: 21 } });
      }
    });

    it('parses find with filter and projection', () => {
      const result = parseQuery('db.users.find({}, { name: 1, email: 1 })');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({});
        expect(result.value.projection).toEqual({ name: 1, email: 1 });
      }
    });

    it('parses find with complex filter', () => {
      const result = parseQuery(
        'db.users.find({ $or: [{ status: "active" }, { role: "admin" }] })'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({
          $or: [{ status: 'active' }, { role: 'admin' }],
        });
      }
    });

    it('parses find with chained sort', () => {
      const result = parseQuery('db.users.find({}).sort({ created: -1 })');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sort).toEqual({ created: -1 });
      }
    });

    it('parses find with chained limit', () => {
      const result = parseQuery('db.users.find({}).limit(10)');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.limit).toBe(10);
      }
    });

    it('parses find with chained skip', () => {
      const result = parseQuery('db.users.find({}).skip(20)');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.skip).toBe(20);
      }
    });

    it('parses find with multiple chained methods', () => {
      const result = parseQuery('db.users.find({}).sort({ created: -1 }).skip(10).limit(5)');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sort).toEqual({ created: -1 });
        expect(result.value.skip).toBe(10);
        expect(result.value.limit).toBe(5);
      }
    });

    it('parses find with string values', () => {
      const result = parseQuery("db.users.find({ name: 'John' })");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({ name: 'John' });
      }
    });

    it('parses find with nested objects', () => {
      const result = parseQuery('db.users.find({ "address.city": "NYC" })');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({ 'address.city': 'NYC' });
      }
    });
  });

  describe('aggregate queries', () => {
    it('parses aggregate with pipeline', () => {
      const result = parseQuery(
        'db.orders.aggregate([{ $match: { status: "completed" } }, { $group: { _id: "$customerId", total: { $sum: "$amount" } } }])'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.collection).toBe('orders');
        expect(result.value.operation).toBe('aggregate');
        expect(result.value.pipeline).toEqual([
          { $match: { status: 'completed' } },
          { $group: { _id: '$customerId', total: { $sum: '$amount' } } },
        ]);
      }
    });

    it('parses aggregate with single stage', () => {
      const result = parseQuery('db.users.aggregate([{ $count: "total" }])');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pipeline).toEqual([{ $count: 'total' }]);
      }
    });
  });

  describe('count queries', () => {
    it('parses count with filter', () => {
      const result = parseQuery('db.users.count({ active: true })');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.collection).toBe('users');
        expect(result.value.operation).toBe('count');
        expect(result.value.filter).toEqual({ active: true });
      }
    });

    it('parses countDocuments', () => {
      const result = parseQuery('db.users.countDocuments({ status: "active" })');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operation).toBe('count');
        expect(result.value.filter).toEqual({ status: 'active' });
      }
    });

    it('parses count without filter', () => {
      const result = parseQuery('db.users.count({})');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({});
      }
    });
  });

  describe('distinct queries', () => {
    it('parses distinct with field', () => {
      const result = parseQuery("db.users.distinct('role')");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.collection).toBe('users');
        expect(result.value.operation).toBe('distinct');
        expect(result.value.field).toBe('role');
      }
    });

    it('parses distinct with field and filter', () => {
      const result = parseQuery("db.users.distinct('role', { active: true })");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.field).toBe('role');
        expect(result.value.filter).toEqual({ active: true });
      }
    });
  });

  describe('error handling', () => {
    it('returns error for invalid query format', () => {
      const result = parseQuery('users.find({})');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('must start with db.');
      }
    });

    it('returns error for unsupported operation', () => {
      const result = parseQuery('db.users.mapReduce({})');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Unsupported operation');
      }
    });

    it('returns error for unmatched parenthesis', () => {
      const result = parseQuery('db.users.find({');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Unmatched parenthesis');
      }
    });

    it('returns error for invalid object syntax', () => {
      const result = parseQuery('db.users.find({ name: })');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid object syntax');
      }
    });
  });

  describe('regex literals', () => {
    it('parses simple regex literal', () => {
      const result = parseQuery('db.data.find({callLetters: /^B/})');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({ callLetters: { $regex: '^B' } });
      }
    });

    it('parses regex literal with flags', () => {
      const result = parseQuery('db.users.find({name: /john/i})');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({ name: { $regex: 'john', $options: 'i' } });
      }
    });

    it('parses regex with multiple flags', () => {
      const result = parseQuery('db.logs.find({message: /error/im})');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({ message: { $regex: 'error', $options: 'im' } });
      }
    });

    it('parses regex with escaped slash', () => {
      const result = parseQuery('db.paths.find({path: /\\/usr\\/bin/})');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({ path: { $regex: '\\/usr\\/bin' } });
      }
    });

    it('parses regex with special characters', () => {
      const result = parseQuery('db.emails.find({email: /.*@example\\.com$/})');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({ email: { $regex: '.*@example\\.com$' } });
      }
    });

    it('parses multiple regex literals in one query', () => {
      const result = parseQuery('db.users.find({name: /^A/, email: /@test\\.com$/i})');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({
          name: { $regex: '^A' },
          email: { $regex: '@test\\.com$', $options: 'i' },
        });
      }
    });

    it('parses regex in array context', () => {
      const result = parseQuery('db.users.find({$or: [{name: /^A/}, {name: /^B/}]})');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({
          $or: [{ name: { $regex: '^A' } }, { name: { $regex: '^B' } }],
        });
      }
    });

    it('does not convert regex-like strings inside quotes', () => {
      const result = parseQuery('db.users.find({pattern: "/not-a-regex/"})');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({ pattern: '/not-a-regex/' });
      }
    });
  });

  describe('edge cases', () => {
    it('handles collection names with underscores', () => {
      const result = parseQuery('db.user_profiles.find({})');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.collection).toBe('user_profiles');
      }
    });

    it('handles collection names with numbers', () => {
      const result = parseQuery('db.logs2024.find({})');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.collection).toBe('logs2024');
      }
    });

    it('handles collection names with hyphens', () => {
      const result = parseQuery('db.payment-sessions.find({})');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.collection).toBe('payment-sessions');
      }
    });

    it('handles whitespace variations', () => {
      const result = parseQuery(`db.users.find(
        { name: "John" }
      )`);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({ name: 'John' });
      }
    });

    it('handles semicolon at end', () => {
      const result = parseQuery('db.users.find({});');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({});
      }
    });

    it('handles leading line comments before query', () => {
      const result = parseQuery(
        `// cafe ventura
db.location-config.findOneAndUpdate({locationId: '606361ebc9e7fd407a23935d'}, {$set: {iqEntityId: 809029}})`
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.collection).toBe('location-config');
        expect(result.value.operation).toBe('findOneAndUpdate');
      }
    });

    it('handles leading block comments before query', () => {
      const result = parseQuery('/* header comment */ db.users.find({ active: true })');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({ active: true });
      }
    });
  });

  describe('database commands', () => {
    describe('detectQueryType', () => {
      it('detects db commands', () => {
        expect(detectQueryType('db.getCollectionNames()')).toBe('db-command');
        expect(detectQueryType('db.stats()')).toBe('db-command');
        expect(detectQueryType('db.serverStatus()')).toBe('db-command');
        expect(detectQueryType('db.createCollection("test")')).toBe('db-command');
      });

      it('detects collection queries', () => {
        expect(detectQueryType('db.users.find({})')).toBe('collection');
        expect(detectQueryType('db.orders.aggregate([])')).toBe('collection');
        expect(detectQueryType('db.logs.count({})')).toBe('collection');
      });

      it('treats unknown db methods as collection names', () => {
        // unknownMethod is not in DB_COMMAND_SIGNATURES, so treated as collection
        expect(detectQueryType('db.unknownMethod.find({})')).toBe('collection');
      });
    });

    describe('parseDbCommand', () => {
      it('parses getCollectionNames', () => {
        const result = parseDbCommand('db.getCollectionNames()');

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.type).toBe('db-command');
          expect(result.value.command).toBe('getCollectionNames');
          expect(result.value.args).toEqual([]);
        }
      });

      it('parses stats with no args', () => {
        const result = parseDbCommand('db.stats()');

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.command).toBe('stats');
          expect(result.value.args).toEqual([]);
        }
      });

      it('parses stats with scale option', () => {
        const result = parseDbCommand('db.stats({ scale: 1024 })');

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.command).toBe('stats');
          expect(result.value.args).toEqual([{ scale: 1024 }]);
        }
      });

      it('parses createCollection with name', () => {
        const result = parseDbCommand('db.createCollection("newCollection")');

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.command).toBe('createCollection');
          expect(result.value.args).toEqual(['newCollection']);
        }
      });

      it('parses createCollection with name and options', () => {
        const result = parseDbCommand(
          'db.createCollection("capped", { capped: true, size: 1000000 })'
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.command).toBe('createCollection');
          expect(result.value.args).toEqual(['capped', { capped: true, size: 1000000 }]);
        }
      });

      it('parses dropCollection', () => {
        const result = parseDbCommand('db.dropCollection("oldCollection")');

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.command).toBe('dropCollection');
          expect(result.value.args).toEqual(['oldCollection']);
        }
      });

      it('parses renameCollection', () => {
        const result = parseDbCommand('db.renameCollection("old", "new")');

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.command).toBe('renameCollection');
          expect(result.value.args).toEqual(['old', 'new']);
        }
      });

      it('parses runCommand', () => {
        const result = parseDbCommand('db.runCommand({ ping: 1 })');

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.command).toBe('runCommand');
          expect(result.value.args).toEqual([{ ping: 1 }]);
        }
      });

      it('parses listCollections with filter', () => {
        const result = parseDbCommand('db.listCollections({ name: "users" })');

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.command).toBe('listCollections');
          expect(result.value.args).toEqual([{ name: 'users' }]);
        }
      });

      it('returns error for unsupported command', () => {
        const result = parseDbCommand('db.unsupportedCommand()');

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.message).toContain('Unsupported database command');
        }
      });

      it('returns error for too few arguments', () => {
        const result = parseDbCommand('db.createCollection()');

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.message).toContain('requires at least 1 argument');
        }
      });

      it('returns error for too many arguments', () => {
        const result = parseDbCommand('db.dropCollection("a", "b")');

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.message).toContain('accepts at most 1 argument');
        }
      });

      it('returns error for unmatched parenthesis', () => {
        const result = parseDbCommand('db.stats(');

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.message).toContain('Unmatched parenthesis');
        }
      });
    });

    describe('parseQuery unified parser', () => {
      it('routes db commands to parseDbCommand', () => {
        const result = parseQuery('db.getCollectionNames()');

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.type).toBe('db-command');
        }
      });

      it('routes collection queries to parseCollectionQuery', () => {
        const result = parseQuery('db.users.find({})');

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.type).toBe('collection');
        }
      });
    });

    describe('DB_COMMAND_SIGNATURES', () => {
      it('defines expected commands', () => {
        expect(DB_COMMAND_SIGNATURES).toHaveProperty('getCollectionNames');
        expect(DB_COMMAND_SIGNATURES).toHaveProperty('stats');
        expect(DB_COMMAND_SIGNATURES).toHaveProperty('createCollection');
        expect(DB_COMMAND_SIGNATURES).toHaveProperty('dropCollection');
        expect(DB_COMMAND_SIGNATURES).toHaveProperty('runCommand');
      });
    });
  });

  describe('findOne queries', () => {
    it('parses findOne with filter', () => {
      const result = parseQuery('db.users.findOne({ name: "Alice" })');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.collection).toBe('users');
        expect(result.value.operation).toBe('findOne');
        expect(result.value.filter).toEqual({ name: 'Alice' });
      }
    });

    it('parses findOne with filter and projection', () => {
      const result = parseQuery('db.users.findOne({ name: "Alice" }, { name: 1, age: 1 })');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({ name: 'Alice' });
        expect(result.value.projection).toEqual({ name: 1, age: 1 });
      }
    });

    it('parses findOne with empty filter', () => {
      const result = parseQuery('db.users.findOne({})');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operation).toBe('findOne');
        expect(result.value.filter).toEqual({});
      }
    });
  });

  describe('insert operations', () => {
    it('parses insertOne with document', () => {
      const result = parseQuery('db.users.insertOne({ name: "Alice", age: 30 })');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.collection).toBe('users');
        expect(result.value.operation).toBe('insertOne');
        expect(result.value.document).toEqual({ name: 'Alice', age: 30 });
      }
    });

    it('returns error for insertOne without arguments', () => {
      const result = parseQuery('db.users.insertOne()');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('insertOne requires a document');
      }
    });

    it('parses insertMany with array of documents', () => {
      const result = parseQuery('db.users.insertMany([{ name: "Alice" }, { name: "Bob" }])');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operation).toBe('insertMany');
        expect(result.value.documents).toEqual([{ name: 'Alice' }, { name: 'Bob' }]);
      }
    });

    it('returns error for insertMany without arguments', () => {
      const result = parseQuery('db.users.insertMany()');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('insertMany requires an array');
      }
    });
  });

  describe('update operations', () => {
    it('parses updateOne with filter and update', () => {
      const result = parseQuery('db.users.updateOne({ name: "Alice" }, { $set: { age: 31 } })');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operation).toBe('updateOne');
        expect(result.value.filter).toEqual({ name: 'Alice' });
        expect(result.value.update).toEqual({ $set: { age: 31 } });
      }
    });

    it('parses updateOne with options', () => {
      const result = parseQuery(
        'db.users.updateOne({ name: "Alice" }, { $set: { age: 31 } }, { upsert: true })'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.options).toEqual({ upsert: true });
      }
    });

    it('parses updateMany with filter and update', () => {
      const result = parseQuery(
        'db.users.updateMany({ active: false }, { $set: { archived: true } })'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operation).toBe('updateMany');
        expect(result.value.filter).toEqual({ active: false });
        expect(result.value.update).toEqual({ $set: { archived: true } });
      }
    });

    it('returns error for updateOne with fewer than 2 args', () => {
      const result = parseQuery('db.users.updateOne({ name: "Alice" })');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('requires at least 2 arguments');
      }
    });

    it('returns error for updateMany with fewer than 2 args', () => {
      const result = parseQuery('db.users.updateMany({ active: false })');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('requires at least 2 arguments');
      }
    });
  });

  describe('replaceOne', () => {
    it('parses replaceOne with filter and replacement', () => {
      const result = parseQuery(
        'db.users.replaceOne({ name: "Alice" }, { name: "Alice", age: 31, role: "admin" })'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operation).toBe('replaceOne');
        expect(result.value.filter).toEqual({ name: 'Alice' });
        expect(result.value.replacement).toEqual({ name: 'Alice', age: 31, role: 'admin' });
      }
    });

    it('parses replaceOne with options', () => {
      const result = parseQuery(
        'db.users.replaceOne({ name: "Alice" }, { name: "Alice" }, { upsert: true })'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.options).toEqual({ upsert: true });
      }
    });

    it('returns error for replaceOne with fewer than 2 args', () => {
      const result = parseQuery('db.users.replaceOne({ name: "Alice" })');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('requires at least 2 arguments');
      }
    });
  });

  describe('delete operations', () => {
    it('parses deleteOne with filter', () => {
      const result = parseQuery('db.users.deleteOne({ name: "Alice" })');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operation).toBe('deleteOne');
        expect(result.value.filter).toEqual({ name: 'Alice' });
      }
    });

    it('parses deleteMany with filter', () => {
      const result = parseQuery('db.users.deleteMany({ active: false })');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operation).toBe('deleteMany');
        expect(result.value.filter).toEqual({ active: false });
      }
    });

    it('parses deleteMany with empty filter', () => {
      const result = parseQuery('db.users.deleteMany({})');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter).toEqual({});
      }
    });
  });

  describe('findOneAnd* operations', () => {
    it('parses findOneAndUpdate', () => {
      const result = parseQuery(
        'db.users.findOneAndUpdate({ name: "Alice" }, { $set: { age: 31 } })'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operation).toBe('findOneAndUpdate');
        expect(result.value.filter).toEqual({ name: 'Alice' });
        expect(result.value.update).toEqual({ $set: { age: 31 } });
      }
    });

    it('parses findOneAndUpdate with options', () => {
      const result = parseQuery(
        'db.users.findOneAndUpdate({ name: "Alice" }, { $set: { age: 31 } }, { returnDocument: "after" })'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.options).toEqual({ returnDocument: 'after' });
      }
    });

    it('returns error for findOneAndUpdate with fewer than 2 args', () => {
      const result = parseQuery('db.users.findOneAndUpdate({ name: "Alice" })');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('requires at least 2 arguments');
      }
    });

    it('parses findOneAndReplace', () => {
      const result = parseQuery(
        'db.users.findOneAndReplace({ name: "Alice" }, { name: "Alice", age: 31 })'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operation).toBe('findOneAndReplace');
        expect(result.value.filter).toEqual({ name: 'Alice' });
        expect(result.value.replacement).toEqual({ name: 'Alice', age: 31 });
      }
    });

    it('returns error for findOneAndReplace with fewer than 2 args', () => {
      const result = parseQuery('db.users.findOneAndReplace({ name: "Alice" })');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('requires at least 2 arguments');
      }
    });

    it('parses findOneAndDelete', () => {
      const result = parseQuery('db.users.findOneAndDelete({ name: "Alice" })');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operation).toBe('findOneAndDelete');
        expect(result.value.filter).toEqual({ name: 'Alice' });
      }
    });

    it('parses findOneAndDelete with options', () => {
      const result = parseQuery(
        'db.users.findOneAndDelete({ name: "Alice" }, { projection: { name: 1 } })'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.options).toEqual({ projection: { name: 1 } });
      }
    });
  });

  describe('index operations', () => {
    it('parses createIndex with spec', () => {
      const result = parseQuery('db.users.createIndex({ email: 1 })');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operation).toBe('createIndex');
        expect(result.value.indexSpec).toEqual({ email: 1 });
      }
    });

    it('parses createIndex with spec and options', () => {
      const result = parseQuery('db.users.createIndex({ email: 1 }, { unique: true })');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.indexSpec).toEqual({ email: 1 });
        expect(result.value.options).toEqual({ unique: true });
      }
    });

    it('returns error for createIndex without arguments', () => {
      const result = parseQuery('db.users.createIndex()');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('createIndex requires at least 1 argument');
      }
    });

    it('parses dropIndex with name', () => {
      const result = parseQuery('db.users.dropIndex("email_1")');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operation).toBe('dropIndex');
        expect(result.value.indexName).toBe('email_1');
      }
    });

    it('returns error for dropIndex without arguments', () => {
      const result = parseQuery('db.users.dropIndex()');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('dropIndex requires an index name');
      }
    });

    it('parses getIndexes', () => {
      const result = parseQuery('db.users.getIndexes()');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operation).toBe('getIndexes');
      }
    });

    it('parses indexes as alias for getIndexes', () => {
      const result = parseQuery('db.users.indexes()');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operation).toBe('getIndexes');
      }
    });
  });

  describe('bulkWrite', () => {
    it('parses bulkWrite with operations array', () => {
      const result = parseQuery(
        'db.users.bulkWrite([{ insertOne: { document: { name: "Alice" } } }, { deleteOne: { filter: { name: "Bob" } } }])'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operation).toBe('bulkWrite');
        expect(result.value.operations).toHaveLength(2);
      }
    });

    it('returns error for bulkWrite without arguments', () => {
      const result = parseQuery('db.users.bulkWrite()');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('bulkWrite requires an array');
      }
    });
  });
});
