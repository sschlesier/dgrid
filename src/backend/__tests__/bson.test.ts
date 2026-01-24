import { describe, it, expect } from 'vitest';
import { ObjectId, Binary, Decimal128, Long, UUID } from 'mongodb';
import { serializeDocument, deserializeDocument } from '../db/bson.js';

describe('BSON Serialization', () => {
  describe('serializeDocument', () => {
    it('passes through primitive values unchanged', () => {
      const doc = {
        string: 'hello',
        number: 42,
        boolean: true,
        null: null,
      };

      const result = serializeDocument(doc);

      expect(result).toEqual(doc);
    });

    it('serializes ObjectId', () => {
      const id = new ObjectId('507f1f77bcf86cd799439011');
      const doc = { _id: id };

      const result = serializeDocument(doc);

      expect(result._id).toEqual({
        _type: 'ObjectId',
        _value: '507f1f77bcf86cd799439011',
      });
    });

    it('serializes Date', () => {
      const date = new Date('2026-01-23T12:00:00.000Z');
      const doc = { createdAt: date };

      const result = serializeDocument(doc);

      expect(result.createdAt).toEqual({
        _type: 'Date',
        _value: '2026-01-23T12:00:00.000Z',
      });
    });

    it('serializes Binary', () => {
      const binary = new Binary(Buffer.from('hello'));
      const doc = { data: binary };

      const result = serializeDocument(doc);

      expect(result.data).toEqual({
        _type: 'Binary',
        _value: 'aGVsbG8=',
      });
    });

    it('serializes Decimal128', () => {
      const decimal = Decimal128.fromString('123.456');
      const doc = { price: decimal };

      const result = serializeDocument(doc);

      expect(result.price).toEqual({
        _type: 'Decimal128',
        _value: '123.456',
      });
    });

    it('serializes Long', () => {
      const long = Long.fromString('9223372036854775807');
      const doc = { bigNumber: long };

      const result = serializeDocument(doc);

      expect(result.bigNumber).toEqual({
        _type: 'Long',
        _value: '9223372036854775807',
      });
    });

    it('serializes UUID', () => {
      const uuid = new UUID('550e8400-e29b-41d4-a716-446655440000');
      const doc = { uuid };

      const result = serializeDocument(doc);

      expect(result.uuid).toEqual({
        _type: 'UUID',
        _value: '550e8400-e29b-41d4-a716-446655440000',
      });
    });

    it('serializes nested documents', () => {
      const doc = {
        user: {
          _id: new ObjectId('507f1f77bcf86cd799439011'),
          name: 'John',
        },
      };

      const result = serializeDocument(doc);

      expect(result.user).toEqual({
        _id: { _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' },
        name: 'John',
      });
    });

    it('serializes arrays', () => {
      const doc = {
        ids: [new ObjectId('507f1f77bcf86cd799439011'), new ObjectId('507f1f77bcf86cd799439012')],
      };

      const result = serializeDocument(doc);

      expect(result.ids).toEqual([
        { _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' },
        { _type: 'ObjectId', _value: '507f1f77bcf86cd799439012' },
      ]);
    });

    it('serializes arrays of nested documents', () => {
      const doc = {
        items: [
          { id: new ObjectId('507f1f77bcf86cd799439011'), name: 'Item 1' },
          { id: new ObjectId('507f1f77bcf86cd799439012'), name: 'Item 2' },
        ],
      };

      const result = serializeDocument(doc);

      expect(result.items).toEqual([
        { id: { _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' }, name: 'Item 1' },
        { id: { _type: 'ObjectId', _value: '507f1f77bcf86cd799439012' }, name: 'Item 2' },
      ]);
    });
  });

  describe('deserializeDocument', () => {
    it('passes through primitive values unchanged', () => {
      const doc = {
        string: 'hello',
        number: 42,
        boolean: true,
        null: null,
      };

      const result = deserializeDocument(doc);

      expect(result).toEqual(doc);
    });

    it('deserializes ObjectId', () => {
      const doc = {
        _id: { _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' },
      };

      const result = deserializeDocument(doc);

      expect(result._id).toBeInstanceOf(ObjectId);
      expect((result._id as ObjectId).toHexString()).toBe('507f1f77bcf86cd799439011');
    });

    it('deserializes Date', () => {
      const doc = {
        createdAt: { _type: 'Date', _value: '2026-01-23T12:00:00.000Z' },
      };

      const result = deserializeDocument(doc);

      expect(result.createdAt).toBeInstanceOf(Date);
      expect((result.createdAt as Date).toISOString()).toBe('2026-01-23T12:00:00.000Z');
    });

    it('deserializes Binary', () => {
      const doc = {
        data: { _type: 'Binary', _value: 'aGVsbG8=' },
      };

      const result = deserializeDocument(doc);

      expect(result.data).toBeInstanceOf(Binary);
      expect((result.data as Binary).toString()).toBe('hello');
    });

    it('deserializes Decimal128', () => {
      const doc = {
        price: { _type: 'Decimal128', _value: '123.456' },
      };

      const result = deserializeDocument(doc);

      expect(result.price).toBeInstanceOf(Decimal128);
      expect((result.price as Decimal128).toString()).toBe('123.456');
    });

    it('deserializes Long', () => {
      const doc = {
        bigNumber: { _type: 'Long', _value: '9223372036854775807' },
      };

      const result = deserializeDocument(doc);

      expect(result.bigNumber).toBeInstanceOf(Long);
      expect((result.bigNumber as Long).toString()).toBe('9223372036854775807');
    });

    it('deserializes UUID', () => {
      const doc = {
        uuid: { _type: 'UUID', _value: '550e8400-e29b-41d4-a716-446655440000' },
      };

      const result = deserializeDocument(doc);

      expect(result.uuid).toBeInstanceOf(UUID);
      expect((result.uuid as UUID).toString()).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('deserializes nested documents', () => {
      const doc = {
        user: {
          _id: { _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' },
          name: 'John',
        },
      };

      const result = deserializeDocument(doc);

      expect(result.user).toEqual({
        _id: expect.any(ObjectId),
        name: 'John',
      });
    });

    it('deserializes arrays', () => {
      const doc = {
        ids: [
          { _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' },
          { _type: 'ObjectId', _value: '507f1f77bcf86cd799439012' },
        ],
      };

      const result = deserializeDocument(doc);

      expect(result.ids).toHaveLength(2);
      expect((result.ids as ObjectId[])[0]).toBeInstanceOf(ObjectId);
      expect((result.ids as ObjectId[])[1]).toBeInstanceOf(ObjectId);
    });
  });

  describe('round-trip', () => {
    it('preserves document after serialize/deserialize', () => {
      const original = {
        _id: new ObjectId('507f1f77bcf86cd799439011'),
        name: 'Test Document',
        count: 42,
        price: Decimal128.fromString('99.99'),
        createdAt: new Date('2026-01-23T12:00:00.000Z'),
        data: new Binary(Buffer.from('binary data')),
        tags: ['a', 'b', 'c'],
        nested: {
          id: new ObjectId('507f1f77bcf86cd799439012'),
          value: 'nested value',
        },
      };

      const serialized = serializeDocument(original);
      const deserialized = deserializeDocument(serialized);

      expect((deserialized._id as ObjectId).toHexString()).toBe(
        (original._id as ObjectId).toHexString()
      );
      expect(deserialized.name).toBe(original.name);
      expect(deserialized.count).toBe(original.count);
      expect((deserialized.price as Decimal128).toString()).toBe(
        (original.price as Decimal128).toString()
      );
      expect((deserialized.createdAt as Date).toISOString()).toBe(
        (original.createdAt as Date).toISOString()
      );
      expect((deserialized.data as Binary).toString()).toBe((original.data as Binary).toString());
      expect(deserialized.tags).toEqual(original.tags);
      expect(((deserialized.nested as Record<string, unknown>).id as ObjectId).toHexString()).toBe(
        ((original.nested as Record<string, unknown>).id as ObjectId).toHexString()
      );
    });
  });
});
