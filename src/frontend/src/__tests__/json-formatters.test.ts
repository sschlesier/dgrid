import { describe, it, expect } from 'vitest';
import {
  formatMongoShell,
  formatPureJson,
  formatMongoexport,
  formatRelaxedEjson,
  formatDocument,
  formatDocuments,
} from '../components/results/json/formatters';

describe('JSON Formatters', () => {
  const simpleDoc = {
    name: 'John',
    age: 30,
    active: true,
    tags: ['a', 'b'],
    address: { city: 'NYC' },
  };

  const bsonDoc = {
    _id: { _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' },
    createdAt: { _type: 'Date', _value: '2023-01-15T10:30:00.000Z' },
    balance: { _type: 'Decimal128', _value: '123.45' },
    count: { _type: 'Long', _value: '9007199254740993' },
  };

  describe('formatMongoShell', () => {
    it('formats simple document as JSON', () => {
      const result = formatMongoShell(simpleDoc);
      expect(result).toContain('"name": "John"');
      expect(result).toContain('"age": 30');
      expect(result).toContain('"active": true');
    });

    it('formats ObjectId with constructor syntax', () => {
      const result = formatMongoShell(bsonDoc);
      expect(result).toContain('ObjectId("507f1f77bcf86cd799439011")');
    });

    it('formats Date with ISODate syntax', () => {
      const result = formatMongoShell(bsonDoc);
      expect(result).toContain('ISODate("2023-01-15T10:30:00.000Z")');
    });

    it('formats Decimal128 with NumberDecimal syntax', () => {
      const result = formatMongoShell(bsonDoc);
      expect(result).toContain('NumberDecimal("123.45")');
    });

    it('formats Long with NumberLong syntax', () => {
      const result = formatMongoShell(bsonDoc);
      expect(result).toContain('NumberLong("9007199254740993")');
    });
  });

  describe('formatPureJson', () => {
    it('formats simple document as JSON', () => {
      const result = formatPureJson(simpleDoc);
      expect(result).toContain('"name": "John"');
    });

    it('formats ObjectId as Extended JSON', () => {
      const result = formatPureJson(bsonDoc);
      expect(result).toContain('"$oid": "507f1f77bcf86cd799439011"');
    });

    it('formats Date as Extended JSON', () => {
      const result = formatPureJson(bsonDoc);
      expect(result).toContain('"$date": "2023-01-15T10:30:00.000Z"');
    });
  });

  describe('formatMongoexport', () => {
    it('formats as single line', () => {
      const result = formatMongoexport(simpleDoc);
      expect(result).not.toContain('\n');
    });

    it('uses Extended JSON format', () => {
      const result = formatMongoexport(bsonDoc);
      expect(result).toContain('"$oid"');
    });
  });

  describe('formatRelaxedEjson', () => {
    it('formats dates as ISO strings', () => {
      const result = formatRelaxedEjson(bsonDoc);
      // Should contain ISO format date
      expect(result).toContain('$date');
    });

    it('parses safe Long values as numbers', () => {
      const safeDoc = {
        count: { _type: 'Long', _value: '12345' },
      };
      const result = formatRelaxedEjson(safeDoc);
      // Should be a plain number, not $numberLong
      expect(result).not.toContain('$numberLong');
      expect(result).toContain('12345');
    });

    it('keeps unsafe Long values as $numberLong', () => {
      const result = formatRelaxedEjson(bsonDoc);
      // 9007199254740993 is larger than MAX_SAFE_INTEGER
      expect(result).toContain('$numberLong');
    });
  });

  describe('formatDocument', () => {
    it('routes to correct formatter', () => {
      const shell = formatDocument(bsonDoc, 'mongodb-shell');
      const json = formatDocument(bsonDoc, 'pure-json');

      expect(shell).toContain('ObjectId(');
      expect(json).toContain('$oid');
    });
  });

  describe('formatDocuments', () => {
    it('formats multiple documents', () => {
      const docs = [{ name: 'A' }, { name: 'B' }];
      const result = formatDocuments(docs, 'pure-json');
      expect(result).toContain('"name": "A"');
      expect(result).toContain('"name": "B"');
    });

    it('formats mongoexport as one line per document', () => {
      const docs = [{ name: 'A' }, { name: 'B' }];
      const result = formatDocuments(docs, 'mongoexport');
      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('"name":"A"');
      expect(lines[1]).toContain('"name":"B"');
    });
  });
});
