import { describe, it, expect } from 'vitest';
import { flattenDocument, generateCsv } from '../csv';

describe('flattenDocument', () => {
  it('handles flat documents with strings, numbers, and booleans', () => {
    const doc = { name: 'Alice', age: 30, active: true };
    expect(flattenDocument(doc)).toEqual({
      name: 'Alice',
      age: '30',
      active: 'true',
    });
  });

  it('flattens nested objects to dot-notation', () => {
    const doc = { address: { city: 'NYC', zip: '10001' } };
    expect(flattenDocument(doc)).toEqual({
      'address.city': 'NYC',
      'address.zip': '10001',
    });
  });

  it('flattens deeply nested objects', () => {
    const doc = { a: { b: { c: 'deep' } } };
    expect(flattenDocument(doc)).toEqual({ 'a.b.c': 'deep' });
  });

  it('JSON-stringifies arrays of primitives', () => {
    const doc = { tags: [1, 2, 3] };
    expect(flattenDocument(doc)).toEqual({ tags: '[1,2,3]' });
  });

  it('JSON-stringifies arrays of objects', () => {
    const doc = { items: [{ x: 1 }, { x: 2 }] };
    expect(flattenDocument(doc)).toEqual({ items: '[{"x":1},{"x":2}]' });
  });

  it('converts null and undefined to empty string', () => {
    const doc = { a: null, b: undefined };
    expect(flattenDocument(doc)).toEqual({ a: '', b: '' });
  });

  describe('serialized BSON types', () => {
    it('extracts ObjectId value', () => {
      const doc = { _id: { _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' } };
      expect(flattenDocument(doc)).toEqual({ _id: '507f1f77bcf86cd799439011' });
    });

    it('extracts Date value', () => {
      const doc = { created: { _type: 'Date', _value: '2024-01-15T12:00:00.000Z' } };
      expect(flattenDocument(doc)).toEqual({ created: '2024-01-15T12:00:00.000Z' });
    });

    it('extracts UUID value', () => {
      const doc = { id: { _type: 'UUID', _value: '550e8400-e29b-41d4-a716-446655440000' } };
      expect(flattenDocument(doc)).toEqual({ id: '550e8400-e29b-41d4-a716-446655440000' });
    });

    it('extracts Decimal128 value', () => {
      const doc = { price: { _type: 'Decimal128', _value: '123.456' } };
      expect(flattenDocument(doc)).toEqual({ price: '123.456' });
    });

    it('extracts Long value', () => {
      const doc = { big: { _type: 'Long', _value: '9007199254740993' } };
      expect(flattenDocument(doc)).toEqual({ big: '9007199254740993' });
    });

    it('extracts Binary as descriptive string', () => {
      const doc = { data: { _type: 'Binary', _value: 'aGVsbG8=' } };
      expect(flattenDocument(doc)).toEqual({ data: 'Binary(aGVsbG8=)' });
    });
  });
});

describe('generateCsv', () => {
  it('returns empty string for empty array', () => {
    expect(generateCsv([])).toBe('');
  });

  it('generates CSV for flat documents', () => {
    const docs = [
      { _id: '1', name: 'Alice', age: 30 },
      { _id: '2', name: 'Bob', age: 25 },
    ];
    const csv = generateCsv(docs);
    expect(csv).toBe('_id,name,age\n1,Alice,30\n2,Bob,25');
  });

  it('puts _id column first', () => {
    const docs = [{ name: 'Alice', _id: '1', email: 'a@b.c' }];
    const csv = generateCsv(docs);
    const header = csv.split('\n')[0];
    expect(header.startsWith('_id')).toBe(true);
  });

  it('escapes fields containing commas', () => {
    const docs = [{ _id: '1', note: 'hello, world' }];
    const csv = generateCsv(docs);
    expect(csv).toBe('_id,note\n1,"hello, world"');
  });

  it('escapes fields containing double quotes', () => {
    const docs = [{ _id: '1', note: 'say "hi"' }];
    const csv = generateCsv(docs);
    expect(csv).toBe('_id,note\n1,"say ""hi"""');
  });

  it('escapes fields containing newlines', () => {
    const docs = [{ _id: '1', note: 'line1\nline2' }];
    const csv = generateCsv(docs);
    expect(csv).toBe('_id,note\n1,"line1\nline2"');
  });

  it('handles mixed schemas with missing fields as empty', () => {
    const docs = [
      { _id: '1', name: 'Alice' },
      { _id: '2', email: 'bob@test.com' },
    ];
    const csv = generateCsv(docs);
    expect(csv).toBe('_id,name,email\n1,Alice,\n2,,bob@test.com');
  });

  it('flattens nested objects in documents', () => {
    const docs = [{ _id: '1', address: { city: 'NYC', zip: '10001' } }];
    const csv = generateCsv(docs);
    expect(csv).toBe('_id,address.city,address.zip\n1,NYC,10001');
  });

  it('handles serialized BSON types in documents', () => {
    const docs = [{ _id: { _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' }, name: 'Test' }];
    const csv = generateCsv(docs);
    expect(csv).toBe('_id,name\n507f1f77bcf86cd799439011,Test');
  });
});
