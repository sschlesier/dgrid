// Grid Utilities

import type {
  CellType,
  GridColumn,
  SerializedBsonValue,
  BsonType,
  DrilldownDocument,
} from './types';

const DEFAULT_COLUMN_WIDTH = 150;
const MIN_COLUMN_WIDTH = 60;
const MAX_COLUMN_WIDTH = 600;

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

// Detect the cell type for a value
export function detectCellType(value: unknown): CellType {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  // Check for BSON serialized types
  if (isSerializedBson(value)) {
    return value._type as BsonType;
  }

  if (Array.isArray(value)) return 'Array';
  if (typeof value === 'object') return 'Object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';

  return 'string'; // fallback
}

// Check if a value can be drilled into (Array or Object)
export function isDrillable(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (isSerializedBson(value)) return false;
  return Array.isArray(value) || typeof value === 'object';
}

// Format a cell value for display
export function formatCellValue(value: unknown, type: CellType): string {
  if (type === 'null') return 'null';
  if (type === 'undefined') return 'undefined';

  // Handle BSON types
  if (isSerializedBson(value)) {
    const bsonValue = value as SerializedBsonValue;
    switch (bsonValue._type) {
      case 'ObjectId':
        return `ObjectId("${bsonValue._value}")`;
      case 'Date':
        return new Date(bsonValue._value).toLocaleString();
      case 'UUID':
        return `UUID("${bsonValue._value}")`;
      case 'Binary':
        return `Binary(${bsonValue._value.length} bytes)`;
      case 'Decimal128':
        return bsonValue._value;
      case 'Long':
        return bsonValue._value;
    }
  }

  // Handle drillable types
  if (type === 'Array') {
    const arr = value as unknown[];
    return `[ ${arr.length} element${arr.length !== 1 ? 's' : ''} ]`;
  }

  if (type === 'Object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    return `{ ${keys.length} field${keys.length !== 1 ? 's' : ''} }`;
  }

  // Handle primitives
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'number') return String(value);
  if (type === 'string') {
    const str = value as string;
    // Truncate long strings
    if (str.length > 100) {
      return str.slice(0, 100) + '...';
    }
    return str;
  }

  return String(value);
}

// Get the CSS class for a cell type
export function getCellTypeClass(type: CellType): string {
  switch (type) {
    case 'ObjectId':
    case 'UUID':
      return 'cell-id';
    case 'Date':
      return 'cell-date';
    case 'number':
    case 'Long':
    case 'Decimal128':
      return 'cell-number';
    case 'boolean':
      return 'cell-boolean';
    case 'null':
    case 'undefined':
      return 'cell-null';
    case 'Array':
    case 'Object':
      return 'cell-drillable';
    case 'Binary':
      return 'cell-binary';
    default:
      return 'cell-string';
  }
}

// Get value at a nested path
export function getNestedValue(doc: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = doc;

  for (const key of path) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = parseInt(key, 10);
      if (isNaN(index)) return undefined;
      current = current[index];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

// Detect columns from documents
export function detectColumns(docs: Record<string, unknown>[]): GridColumn[] {
  if (docs.length === 0) return [];

  // Collect all unique keys across documents
  const keySet = new Set<string>();
  const keyTypes = new Map<string, CellType>();

  for (const doc of docs) {
    for (const [key, value] of Object.entries(doc)) {
      keySet.add(key);
      // Store the first non-null type we find
      if (!keyTypes.has(key) || keyTypes.get(key) === 'null') {
        keyTypes.set(key, detectCellType(value));
      }
    }
  }

  // Convert to column definitions, with _id first
  const keys = Array.from(keySet);
  const idIndex = keys.indexOf('_id');
  if (idIndex > 0) {
    keys.splice(idIndex, 1);
    keys.unshift('_id');
  }

  // Check if we have numeric keys (array index columns)
  const idKey = keys[0] === '_id' ? ['_id'] : [];
  const restKeys = keys[0] === '_id' ? keys.slice(1) : keys;

  const hasNumericKeys = restKeys.some((k) => {
    const num = parseInt(k, 10);
    return !isNaN(num) && String(num) === k;
  });

  // Only sort if we have numeric keys (array-as-columns mode)
  if (hasNumericKeys) {
    restKeys.sort((a, b) => {
      const aNum = parseInt(a, 10);
      const bNum = parseInt(b, 10);
      const aIsNum = !isNaN(aNum) && String(aNum) === a;
      const bIsNum = !isNaN(bNum) && String(bNum) === b;

      // Both numeric: sort numerically
      if (aIsNum && bIsNum) return aNum - bNum;
      // Numeric comes before non-numeric
      if (aIsNum) return -1;
      if (bIsNum) return 1;
      // Both non-numeric: preserve original order
      return 0;
    });
  }

  const sortedKeys = [...idKey, ...restKeys];

  return sortedKeys.map((key) => ({
    key,
    label: key,
    width: key === '_id' ? 220 : DEFAULT_COLUMN_WIDTH,
    type: keyTypes.get(key),
    sortable: true,
  }));
}

// Compute display data based on drill-down path
export function computeDrilldownData(
  docs: Record<string, unknown>[],
  path: string[]
): DrilldownDocument[] {
  if (path.length === 0) {
    return docs.map((doc, index) => ({ ...doc, _docIndex: index }));
  }

  return docs.map((doc, index) => {
    const nested = getNestedValue(doc, path);
    const docId = doc._id;

    // If nested value is an array, we flatten it
    if (Array.isArray(nested)) {
      // For arrays, each element becomes a row with context
      return {
        _docId: docId,
        _docIndex: index,
        _arrayValue: nested,
      };
    }

    // If nested value is an object, spread its fields
    if (nested && typeof nested === 'object' && !isSerializedBson(nested)) {
      return {
        _docId: docId,
        _docIndex: index,
        ...(nested as Record<string, unknown>),
      };
    }

    // For primitives, just show the value
    return {
      _docId: docId,
      _docIndex: index,
      value: nested,
    };
  });
}

// Check if an array contains objects (that should be flattened into rows)
// vs primitives/BSON types (that should be displayed as columns)
export function isArrayOfObjects(arr: unknown[]): boolean {
  if (arr.length === 0) return false;
  // Check first non-null element
  for (const item of arr) {
    if (item !== null && item !== undefined) {
      return typeof item === 'object' && !Array.isArray(item) && !isSerializedBson(item);
    }
  }
  return false;
}

// Expand array data as columns (when drilling into an array of primitives)
// Each document stays as one row, array indices become columns (0, 1, 2, ...)
export function expandArrayAsColumns(
  docs: Record<string, unknown>[],
  path: string[]
): DrilldownDocument[] {
  return docs.map((doc, docIndex) => {
    const nested = getNestedValue(doc, path);
    const docId = doc._id;
    const row: DrilldownDocument = {
      _docId: docId,
      _docIndex: docIndex,
      _id: docId, // Always include parent document's _id
    };

    if (Array.isArray(nested)) {
      // Each array index becomes a column
      for (let i = 0; i < nested.length; i++) {
        row[String(i)] = nested[i];
      }
    }

    return row;
  });
}

// Flatten array data for display (when drilling into an array of objects)
// Each array element becomes a separate row with object fields as columns
export function flattenArrayData(
  docs: Record<string, unknown>[],
  path: string[]
): DrilldownDocument[] {
  const result: DrilldownDocument[] = [];

  for (let docIndex = 0; docIndex < docs.length; docIndex++) {
    const doc = docs[docIndex];
    const nested = getNestedValue(doc, path);
    const docId = doc._id;

    if (Array.isArray(nested)) {
      for (let arrIndex = 0; arrIndex < nested.length; arrIndex++) {
        const item = nested[arrIndex];
        if (item && typeof item === 'object' && !isSerializedBson(item)) {
          result.push({
            _docId: docId,
            _docIndex: docIndex,
            _arrayIndex: arrIndex,
            ...(item as Record<string, unknown>),
            _id: docId, // Always include parent document's _id (after spread to override any nested _id)
          });
        } else {
          result.push({
            _docId: docId,
            _docIndex: docIndex,
            _arrayIndex: arrIndex,
            _id: docId, // Always include parent document's _id
            value: item,
          });
        }
      }
    } else if (nested && typeof nested === 'object' && !isSerializedBson(nested)) {
      result.push({
        _docId: docId,
        _docIndex: docIndex,
        ...(nested as Record<string, unknown>),
        _id: docId, // Always include parent document's _id (after spread to override any nested _id)
      });
    } else {
      result.push({
        _docId: docId,
        _docIndex: docIndex,
        _id: docId, // Always include parent document's _id
        value: nested,
      });
    }
  }

  return result;
}

// Clamp column width to valid range
export function clampColumnWidth(width: number): number {
  return Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, width));
}

// Sort documents by a column (client-side)
export function sortDocuments(
  docs: DrilldownDocument[],
  column: string,
  direction: 'asc' | 'desc'
): DrilldownDocument[] {
  const sorted = [...docs];

  sorted.sort((a, b) => {
    let aVal = a[column];
    let bVal = b[column];

    // Extract value from BSON types
    if (isSerializedBson(aVal)) aVal = aVal._value;
    if (isSerializedBson(bVal)) bVal = bVal._value;

    // Handle null/undefined
    if (aVal === null || aVal === undefined) return direction === 'asc' ? -1 : 1;
    if (bVal === null || bVal === undefined) return direction === 'asc' ? 1 : -1;

    // Compare values
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    }

    // Fallback to string comparison
    const aStr = String(aVal);
    const bStr = String(bVal);
    return direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
  });

  return sorted;
}

// Format document ID for display
export function formatDocId(docId: unknown): string {
  if (docId === undefined || docId === null) return '';
  if (isSerializedBson(docId)) {
    return docId._value.slice(-8); // Last 8 chars of ObjectId
  }
  const str = String(docId);
  return str.length > 12 ? str.slice(-12) : str;
}
