import { describe, it, expect } from 'vitest';
import {
  detectCellType,
  formatCellValue,
  isDrillable,
  isSerializedBson,
  detectColumns,
  getNestedValue,
  flattenArrayData,
  expandArrayAsColumns,
  isArrayOfObjects,
  sortDocuments,
  getCellTypeClass,
} from '../components/grid/utils';
import type { DrilldownDocument } from '../components/grid/types';

describe('Grid Utils', () => {
  describe('isSerializedBson', () => {
    it('detects serialized BSON ObjectId', () => {
      expect(isSerializedBson({ _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' })).toBe(
        true
      );
    });

    it('detects serialized BSON Date', () => {
      expect(isSerializedBson({ _type: 'Date', _value: '2024-01-15T10:30:00.000Z' })).toBe(true);
    });

    it('rejects regular objects', () => {
      expect(isSerializedBson({ name: 'test' })).toBe(false);
    });

    it('rejects null', () => {
      expect(isSerializedBson(null)).toBe(false);
    });

    it('rejects primitives', () => {
      expect(isSerializedBson('string')).toBe(false);
      expect(isSerializedBson(123)).toBe(false);
    });
  });

  describe('detectCellType', () => {
    it('detects null', () => {
      expect(detectCellType(null)).toBe('null');
    });

    it('detects undefined', () => {
      expect(detectCellType(undefined)).toBe('undefined');
    });

    it('detects string', () => {
      expect(detectCellType('hello')).toBe('string');
    });

    it('detects number', () => {
      expect(detectCellType(42)).toBe('number');
    });

    it('detects boolean', () => {
      expect(detectCellType(true)).toBe('boolean');
    });

    it('detects Array', () => {
      expect(detectCellType([1, 2, 3])).toBe('Array');
    });

    it('detects Object', () => {
      expect(detectCellType({ a: 1 })).toBe('Object');
    });

    it('detects BSON ObjectId', () => {
      expect(detectCellType({ _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' })).toBe(
        'ObjectId'
      );
    });

    it('detects BSON Date', () => {
      expect(detectCellType({ _type: 'Date', _value: '2024-01-15T10:30:00.000Z' })).toBe('Date');
    });
  });

  describe('formatCellValue', () => {
    it('formats null', () => {
      expect(formatCellValue(null, 'null')).toBe('null');
    });

    it('formats undefined', () => {
      expect(formatCellValue(undefined, 'undefined')).toBe('undefined');
    });

    it('formats ObjectId', () => {
      const value = { _type: 'ObjectId' as const, _value: '507f1f77bcf86cd799439011' };
      expect(formatCellValue(value, 'ObjectId')).toBe('ObjectId("507f1f77bcf86cd799439011")');
    });

    it('formats Date', () => {
      const value = { _type: 'Date' as const, _value: '2024-01-15T10:30:00.000Z' };
      const result = formatCellValue(value, 'Date');
      expect(result).toContain('2024'); // Locale-dependent, just check year
    });

    it('formats Array with count', () => {
      expect(formatCellValue([1, 2, 3], 'Array')).toBe('[ 3 elements ]');
    });

    it('formats single element Array', () => {
      expect(formatCellValue([1], 'Array')).toBe('[ 1 element ]');
    });

    it('formats Object with field count', () => {
      expect(formatCellValue({ a: 1, b: 2 }, 'Object')).toBe('{ 2 fields }');
    });

    it('formats single field Object', () => {
      expect(formatCellValue({ a: 1 }, 'Object')).toBe('{ 1 field }');
    });

    it('truncates long strings', () => {
      const longString = 'a'.repeat(150);
      const result = formatCellValue(longString, 'string');
      expect(result.length).toBe(103); // 100 chars + '...'
    });
  });

  describe('isDrillable', () => {
    it('returns true for arrays', () => {
      expect(isDrillable([1, 2, 3])).toBe(true);
    });

    it('returns true for objects', () => {
      expect(isDrillable({ a: 1 })).toBe(true);
    });

    it('returns false for serialized BSON', () => {
      expect(isDrillable({ _type: 'ObjectId', _value: '507f' })).toBe(false);
    });

    it('returns false for null', () => {
      expect(isDrillable(null)).toBe(false);
    });

    it('returns false for primitives', () => {
      expect(isDrillable('string')).toBe(false);
      expect(isDrillable(123)).toBe(false);
    });
  });

  describe('getCellTypeClass', () => {
    it('returns cell-id for ObjectId', () => {
      expect(getCellTypeClass('ObjectId')).toBe('cell-id');
    });

    it('returns cell-number for number types', () => {
      expect(getCellTypeClass('number')).toBe('cell-number');
      expect(getCellTypeClass('Long')).toBe('cell-number');
    });

    it('returns cell-drillable for arrays and objects', () => {
      expect(getCellTypeClass('Array')).toBe('cell-drillable');
      expect(getCellTypeClass('Object')).toBe('cell-drillable');
    });
  });

  describe('detectColumns', () => {
    it('returns empty array for empty docs', () => {
      expect(detectColumns([])).toEqual([]);
    });

    it('detects columns from documents', () => {
      const docs = [
        { _id: { _type: 'ObjectId', _value: '507f' }, name: 'Test', age: 30 },
        { _id: { _type: 'ObjectId', _value: '508f' }, name: 'Test2', email: 'test@example.com' },
      ];
      const columns = detectColumns(docs);

      expect(columns.map((c) => c.key)).toEqual(['_id', 'name', 'age', 'email']);
    });

    it('puts _id column first', () => {
      const docs = [{ name: 'Test', _id: '123', age: 30 }];
      const columns = detectColumns(docs);

      expect(columns[0].key).toBe('_id');
    });
  });

  describe('getNestedValue', () => {
    const doc = {
      name: 'Test',
      address: {
        city: 'NYC',
        zip: '10001',
        coordinates: { lat: 40.7, lng: -74.0 },
      },
      tags: ['a', 'b', 'c'],
    };

    it('returns root value for empty path', () => {
      expect(getNestedValue(doc, [])).toEqual(doc);
    });

    it('gets nested object value', () => {
      expect(getNestedValue(doc, ['address', 'city'])).toBe('NYC');
    });

    it('gets deeply nested value', () => {
      expect(getNestedValue(doc, ['address', 'coordinates', 'lat'])).toBe(40.7);
    });

    it('gets array value by index', () => {
      expect(getNestedValue(doc, ['tags', '1'])).toBe('b');
    });

    it('returns undefined for non-existent path', () => {
      expect(getNestedValue(doc, ['nonexistent'])).toBeUndefined();
    });
  });

  describe('isArrayOfObjects', () => {
    it('returns true for array of objects', () => {
      expect(isArrayOfObjects([{ name: 'A' }, { name: 'B' }])).toBe(true);
    });

    it('returns false for array of primitives', () => {
      expect(isArrayOfObjects([1, 2, 3])).toBe(false);
      expect(isArrayOfObjects(['a', 'b', 'c'])).toBe(false);
    });

    it('returns false for empty array', () => {
      expect(isArrayOfObjects([])).toBe(false);
    });

    it('returns false for array of BSON types', () => {
      expect(
        isArrayOfObjects([
          { _type: 'ObjectId', _value: '507f' },
          { _type: 'ObjectId', _value: '508f' },
        ])
      ).toBe(false);
    });

    it('returns false for array of arrays', () => {
      expect(
        isArrayOfObjects([
          [1, 2],
          [3, 4],
        ])
      ).toBe(false);
    });
  });

  describe('flattenArrayData', () => {
    it('flattens array of objects into rows', () => {
      const docs = [
        {
          _id: '1',
          items: [
            { name: 'A', price: 10 },
            { name: 'B', price: 20 },
          ],
        },
        { _id: '2', items: [{ name: 'C', price: 30 }] },
      ];

      const result = flattenArrayData(docs, ['items']);

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ _docId: '1', _arrayIndex: 0, name: 'A' });
      expect(result[1]).toMatchObject({ _docId: '1', _arrayIndex: 1, name: 'B' });
      expect(result[2]).toMatchObject({ _docId: '2', _arrayIndex: 0, name: 'C' });
    });
  });

  describe('expandArrayAsColumns', () => {
    it('expands array of primitives into columns', () => {
      const docs = [
        { _id: '1', coordinates: [-66.5, 45.2] },
        { _id: '2', coordinates: [-55.9, 49.7] },
        { _id: '3', coordinates: [-25.2, 66.3] },
      ];

      const result = expandArrayAsColumns(docs, ['coordinates']);

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ _docId: '1', '0': -66.5, '1': 45.2 });
      expect(result[1]).toMatchObject({ _docId: '2', '0': -55.9, '1': 49.7 });
      expect(result[2]).toMatchObject({ _docId: '3', '0': -25.2, '1': 66.3 });
    });

    it('handles arrays of different lengths', () => {
      const docs = [
        { _id: '1', values: [1, 2, 3] },
        { _id: '2', values: [4, 5] },
        { _id: '3', values: [6] },
      ];

      const result = expandArrayAsColumns(docs, ['values']);

      expect(result[0]).toMatchObject({ '0': 1, '1': 2, '2': 3 });
      expect(result[1]).toMatchObject({ '0': 4, '1': 5 });
      expect(result[1]['2']).toBeUndefined();
      expect(result[2]).toMatchObject({ '0': 6 });
    });
  });

  describe('detectColumns with numeric keys', () => {
    it('sorts numeric column keys in order', () => {
      const docs = [{ '0': -66.5, '1': 45.2, '10': 100, '2': 30.1 }];

      const columns = detectColumns(docs);

      expect(columns.map((c) => c.key)).toEqual(['0', '1', '2', '10']);
    });
  });

  describe('sortDocuments', () => {
    const docs: DrilldownDocument[] = [
      { _docIndex: 0, name: 'Charlie', age: 30 },
      { _docIndex: 1, name: 'Alice', age: 25 },
      { _docIndex: 2, name: 'Bob', age: 35 },
    ];

    it('sorts strings ascending', () => {
      const sorted = sortDocuments(docs, 'name', 'asc');
      expect(sorted.map((d) => d.name)).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('sorts strings descending', () => {
      const sorted = sortDocuments(docs, 'name', 'desc');
      expect(sorted.map((d) => d.name)).toEqual(['Charlie', 'Bob', 'Alice']);
    });

    it('sorts numbers ascending', () => {
      const sorted = sortDocuments(docs, 'age', 'asc');
      expect(sorted.map((d) => d.age)).toEqual([25, 30, 35]);
    });

    it('sorts numbers descending', () => {
      const sorted = sortDocuments(docs, 'age', 'desc');
      expect(sorted.map((d) => d.age)).toEqual([35, 30, 25]);
    });

    it('handles null values', () => {
      const docsWithNull: DrilldownDocument[] = [
        { _docIndex: 0, name: 'Alice' },
        { _docIndex: 1, name: null },
        { _docIndex: 2, name: 'Bob' },
      ];
      const sorted = sortDocuments(docsWithNull, 'name', 'asc');
      expect(sorted[0].name).toBe(null);
    });
  });
});
