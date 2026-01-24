import { describe, it, expect } from 'vitest';
import { parseQuery } from '../db/queries.js';

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
});
