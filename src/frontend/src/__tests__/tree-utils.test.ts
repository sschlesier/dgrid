import { describe, it, expect } from 'vitest';
import {
  detectValueType,
  isExpandable,
  getDisplayValue,
  getTypeClass,
  buildPath,
  parsePath,
  searchDocument,
  getAncestorPaths,
  getAllPaths,
} from '../components/results/tree/tree-utils';

describe('Tree Utils', () => {
  describe('detectValueType', () => {
    it('detects null', () => {
      expect(detectValueType(null)).toBe('null');
    });

    it('detects undefined', () => {
      expect(detectValueType(undefined)).toBe('undefined');
    });

    it('detects string', () => {
      expect(detectValueType('hello')).toBe('string');
    });

    it('detects number', () => {
      expect(detectValueType(42)).toBe('number');
    });

    it('detects boolean', () => {
      expect(detectValueType(true)).toBe('boolean');
    });

    it('detects array', () => {
      expect(detectValueType([1, 2, 3])).toBe('Array');
    });

    it('detects object', () => {
      expect(detectValueType({ a: 1 })).toBe('Object');
    });

    it('detects BSON ObjectId', () => {
      expect(detectValueType({ _type: 'ObjectId', _value: '123' })).toBe('ObjectId');
    });

    it('detects BSON Date', () => {
      expect(detectValueType({ _type: 'Date', _value: '2023-01-01' })).toBe('Date');
    });
  });

  describe('isExpandable', () => {
    it('returns true for objects', () => {
      expect(isExpandable({ a: 1 })).toBe(true);
    });

    it('returns true for arrays', () => {
      expect(isExpandable([1, 2])).toBe(true);
    });

    it('returns false for primitives', () => {
      expect(isExpandable('string')).toBe(false);
      expect(isExpandable(42)).toBe(false);
      expect(isExpandable(null)).toBe(false);
    });

    it('returns false for BSON types', () => {
      expect(isExpandable({ _type: 'ObjectId', _value: '123' })).toBe(false);
    });
  });

  describe('getDisplayValue', () => {
    it('displays null', () => {
      expect(getDisplayValue(null, 'null')).toBe('null');
    });

    it('displays strings with quotes', () => {
      expect(getDisplayValue('hello', 'string')).toBe('"hello"');
    });

    it('truncates long strings', () => {
      const longString = 'a'.repeat(150);
      const result = getDisplayValue(longString, 'string');
      expect(result.length).toBeLessThan(120);
      expect(result).toContain('...');
    });

    it('displays array length', () => {
      expect(getDisplayValue([1, 2, 3], 'Array')).toBe('Array(3)');
    });

    it('displays object field count', () => {
      expect(getDisplayValue({ a: 1, b: 2 }, 'Object')).toBe('Object(2)');
    });

    it('displays ObjectId', () => {
      expect(getDisplayValue({ _type: 'ObjectId', _value: '123' }, 'ObjectId')).toBe(
        'ObjectId("123")'
      );
    });
  });

  describe('getTypeClass', () => {
    it('returns correct class for types', () => {
      expect(getTypeClass('ObjectId')).toBe('type-id');
      expect(getTypeClass('Date')).toBe('type-date');
      expect(getTypeClass('number')).toBe('type-number');
      expect(getTypeClass('boolean')).toBe('type-boolean');
      expect(getTypeClass('null')).toBe('type-null');
      expect(getTypeClass('string')).toBe('type-string');
      expect(getTypeClass('Array')).toBe('type-array');
    });
  });

  describe('buildPath', () => {
    it('builds path from doc index and segments', () => {
      expect(buildPath(0, ['address', 'city'])).toBe('0.address.city');
      expect(buildPath(1, [0, 'name'])).toBe('1.0.name');
    });
  });

  describe('parsePath', () => {
    it('parses path string to doc index and segments', () => {
      const result = parsePath('0.address.city');
      expect(result.docIndex).toBe(0);
      expect(result.segments).toEqual(['address', 'city']);
    });

    it('parses numeric segments correctly', () => {
      const result = parsePath('1.items.0.name');
      expect(result.docIndex).toBe(1);
      expect(result.segments).toEqual(['items', 0, 'name']);
    });
  });

  describe('searchDocument', () => {
    it('finds matches in field names', () => {
      const doc = { firstName: 'John', lastName: 'Doe' };
      const matches = searchDocument(doc, 'name', 0);
      expect(matches).toContain('0.firstName');
      expect(matches).toContain('0.lastName');
    });

    it('finds matches in string values', () => {
      const doc = { name: 'John Doe', city: 'New York' };
      const matches = searchDocument(doc, 'john', 0);
      expect(matches).toContain('0.name');
    });

    it('finds matches in nested objects', () => {
      const doc = { address: { city: 'Boston' } };
      const matches = searchDocument(doc, 'boston', 0);
      expect(matches).toContain('0.address.city');
    });

    it('finds matches in arrays', () => {
      const doc = { tags: ['alpha', 'beta'] };
      const matches = searchDocument(doc, 'alpha', 0);
      expect(matches).toContain('0.tags.0');
    });
  });

  describe('getAncestorPaths', () => {
    it('returns ancestor paths', () => {
      const ancestors = getAncestorPaths(['0.address.city.name']);
      expect(ancestors.has('0')).toBe(true);
      expect(ancestors.has('0.address')).toBe(true);
      expect(ancestors.has('0.address.city')).toBe(true);
      expect(ancestors.has('0.address.city.name')).toBe(false); // Not ancestor of itself
    });
  });

  describe('getAllPaths', () => {
    it('returns all expandable paths', () => {
      const doc = {
        name: 'John',
        address: {
          city: 'NYC',
          coords: { lat: 40, lng: -74 },
        },
        tags: ['a', 'b'],
      };
      const paths = getAllPaths(doc, 0);
      expect(paths).toContain('0.address');
      expect(paths).toContain('0.address.coords');
      expect(paths).toContain('0.tags');
      expect(paths).not.toContain('0.name'); // Not expandable
    });
  });
});
