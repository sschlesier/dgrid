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
      const result = parseQuery('db.users.insertOne({})');

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
});
