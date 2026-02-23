/**
 * CSV generation utilities for exporting query results.
 */

interface SerializedBsonValue {
  _type: string;
  _value: string;
}

/** Check if a value is a serialized BSON type ({ _type, _value }) from the backend. */
function isSerializedBson(value: unknown): value is SerializedBsonValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_type' in value &&
    '_value' in value &&
    typeof (value as SerializedBsonValue)._type === 'string' &&
    typeof (value as SerializedBsonValue)._value === 'string'
  );
}

/** Extract a display string from a serialized BSON value. */
function extractBsonValue(value: SerializedBsonValue): string {
  switch (value._type) {
    case 'Binary':
      return `Binary(${value._value})`;
    default:
      return value._value;
  }
}

/** Recursively flatten a document using dot-notation keys. */
export function flattenDocument(doc: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(doc)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      result[fullKey] = '';
    } else if (Array.isArray(value)) {
      result[fullKey] = JSON.stringify(value);
    } else if (isSerializedBson(value)) {
      result[fullKey] = extractBsonValue(value);
    } else {
      if (typeof value === 'object') {
        const nested = flattenDocument(value as Record<string, unknown>, fullKey);
        Object.assign(result, nested);
      } else {
        result[fullKey] = String(value);
      }
    }
  }

  return result;
}

/** Escape a value for CSV: quote fields containing commas, quotes, or newlines. */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Generate a CSV string from an array of documents. */
export function generateCsv(documents: Record<string, unknown>[]): string {
  if (documents.length === 0) return '';

  // Flatten all documents and collect the union of all keys
  const flattened = documents.map((doc) => flattenDocument(doc));

  const keySet = new Set<string>();
  for (const doc of flattened) {
    for (const key of Object.keys(doc)) {
      keySet.add(key);
    }
  }

  // Put _id first, then remaining keys in insertion order
  const keys: string[] = [];
  if (keySet.has('_id')) {
    keys.push('_id');
    keySet.delete('_id');
  }
  for (const key of keySet) {
    keys.push(key);
  }

  // Build CSV
  const header = keys.map(escapeCsvField).join(',');
  const rows = flattened.map((doc) => keys.map((key) => escapeCsvField(doc[key] ?? '')).join(','));

  return [header, ...rows].join('\n');
}
