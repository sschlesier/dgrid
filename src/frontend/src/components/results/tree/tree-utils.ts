// Tree view utilities

import type { CellType, BsonType } from '../../grid/types';

interface SerializedBsonValue {
  _type: string;
  _value: string;
}

// Check if value is a serialized BSON type
export function isSerializedBson(value: unknown): value is SerializedBsonValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_type' in value &&
    '_value' in value &&
    typeof (value as SerializedBsonValue)._type === 'string' &&
    typeof (value as SerializedBsonValue)._value === 'string'
  );
}

// Detect the type of a value
export function detectValueType(value: unknown): CellType {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  if (isSerializedBson(value)) {
    return value._type as BsonType;
  }

  if (Array.isArray(value)) return 'Array';
  if (typeof value === 'object') return 'Object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';

  return 'string';
}

// Check if a value is expandable (object or array)
export function isExpandable(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (isSerializedBson(value)) return false;
  return Array.isArray(value) || typeof value === 'object';
}

// Get the display value for a tree node
export function getDisplayValue(value: unknown, type: CellType): string {
  if (type === 'null') return 'null';
  if (type === 'undefined') return 'undefined';

  if (isSerializedBson(value)) {
    const bson = value as SerializedBsonValue;
    switch (bson._type) {
      case 'ObjectId':
        return `ObjectId("${bson._value}")`;
      case 'Date':
        return new Date(bson._value).toLocaleString();
      case 'UUID':
        return `UUID("${bson._value}")`;
      case 'Binary':
        return `Binary(${bson._value.length} bytes)`;
      case 'Decimal128':
        return bson._value;
      case 'Long':
        return bson._value;
    }
  }

  if (type === 'Array') {
    const arr = value as unknown[];
    return `Array(${arr.length})`;
  }

  if (type === 'Object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    return `Object(${keys.length})`;
  }

  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'number') return String(value);
  if (type === 'string') {
    const str = value as string;
    // Truncate long strings
    if (str.length > 100) {
      return `"${str.slice(0, 100)}..."`;
    }
    return `"${str}"`;
  }

  return String(value);
}

// Get CSS class for value type
export function getTypeClass(type: CellType): string {
  switch (type) {
    case 'ObjectId':
    case 'UUID':
      return 'type-id';
    case 'Date':
      return 'type-date';
    case 'number':
    case 'Long':
    case 'Decimal128':
      return 'type-number';
    case 'boolean':
      return 'type-boolean';
    case 'null':
    case 'undefined':
      return 'type-null';
    case 'Array':
      return 'type-array';
    case 'Object':
      return 'type-object';
    case 'Binary':
      return 'type-binary';
    default:
      return 'type-string';
  }
}

// Get type badge label
export function getTypeBadge(type: CellType): string {
  return type;
}

// Build a path string from path segments
export function buildPath(docIndex: number, segments: (string | number)[]): string {
  return `${docIndex}.${segments.join('.')}`;
}

// Parse a path string back to segments
export function parsePath(path: string): { docIndex: number; segments: (string | number)[] } {
  const parts = path.split('.');
  const docIndex = parseInt(parts[0], 10);
  const segments = parts.slice(1).map((p) => {
    const num = parseInt(p, 10);
    return !isNaN(num) && String(num) === p ? num : p;
  });
  return { docIndex, segments };
}

// Check if a path matches or is an ancestor of another path
export function isPathAncestorOf(ancestor: string, descendant: string): boolean {
  return descendant.startsWith(ancestor + '.') || descendant === ancestor;
}

// Search for matches in a document
export function searchDocument(
  doc: Record<string, unknown>,
  query: string,
  docIndex: number,
  currentPath: (string | number)[] = []
): string[] {
  const matches: string[] = [];
  const lowerQuery = query.toLowerCase();

  function searchValue(value: unknown, path: (string | number)[]) {
    // Check key match
    const key = path[path.length - 1];
    if (key !== undefined && String(key).toLowerCase().includes(lowerQuery)) {
      matches.push(buildPath(docIndex, path));
    }

    // Check value match
    if (isSerializedBson(value)) {
      if (value._value.toLowerCase().includes(lowerQuery)) {
        matches.push(buildPath(docIndex, path));
      }
      return;
    }

    if (typeof value === 'string' && value.toLowerCase().includes(lowerQuery)) {
      matches.push(buildPath(docIndex, path));
      return;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      if (String(value).toLowerCase().includes(lowerQuery)) {
        matches.push(buildPath(docIndex, path));
      }
      return;
    }

    // Recurse into objects and arrays
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        searchValue(item, [...path, index]);
      });
      return;
    }

    if (typeof value === 'object' && value !== null) {
      for (const [k, v] of Object.entries(value)) {
        searchValue(v, [...path, k]);
      }
    }
  }

  // Search the document
  for (const [key, val] of Object.entries(doc)) {
    searchValue(val, [...currentPath, key]);
  }

  return matches;
}

// Get all ancestor paths of a set of paths
export function getAncestorPaths(paths: string[]): Set<string> {
  const ancestors = new Set<string>();

  for (const path of paths) {
    const parts = path.split('.');
    for (let i = 1; i < parts.length; i++) {
      ancestors.add(parts.slice(0, i).join('.'));
    }
  }

  return ancestors;
}

// Get all paths in a document (for expand all)
export function getAllPaths(
  doc: Record<string, unknown>,
  docIndex: number,
  currentPath: (string | number)[] = []
): string[] {
  const paths: string[] = [];

  function collectPaths(value: unknown, path: (string | number)[]) {
    if (!isExpandable(value)) return;

    paths.push(buildPath(docIndex, path));

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        collectPaths(item, [...path, index]);
      });
      return;
    }

    if (typeof value === 'object' && value !== null) {
      for (const [k, v] of Object.entries(value)) {
        collectPaths(v, [...path, k]);
      }
    }
  }

  for (const [key, val] of Object.entries(doc)) {
    collectPaths(val, [...currentPath, key]);
  }

  return paths;
}
