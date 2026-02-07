import { ObjectId, Binary, Decimal128, Long, UUID, Document } from 'mongodb';

/** Convert a BSON value to a display string. */
function bsonToString(value: unknown): string | null {
  if (value instanceof ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof UUID) return value.toString();
  if (value instanceof Binary) return `Binary(${value.toString('base64')})`;
  if (value instanceof Decimal128) return value.toString();
  if (value instanceof Long) return value.toString();
  return null;
}

/** Recursively flatten a document using dot-notation keys. */
export function flattenDocument(doc: Document, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(doc)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      result[fullKey] = '';
    } else if (Array.isArray(value)) {
      result[fullKey] = JSON.stringify(value);
    } else {
      const bsonStr = bsonToString(value);
      if (bsonStr !== null) {
        result[fullKey] = bsonStr;
      } else if (typeof value === 'object') {
        Object.assign(result, flattenDocument(value as Document, fullKey));
      } else {
        result[fullKey] = String(value);
      }
    }
  }

  return result;
}

/** Escape a value for CSV: quote fields containing commas, quotes, or newlines. */
export function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Build a single CSV row from a document given an ordered list of columns. */
export function buildCsvRow(doc: Document, columns: string[]): string {
  const flat = flattenDocument(doc);
  return columns.map((col) => escapeCsvField(flat[col] ?? '')).join(',');
}

/** Collect the union of all flattened keys from a batch of documents, with _id first. */
export function collectColumns(docs: Document[]): string[] {
  const keySet = new Set<string>();
  for (const doc of docs) {
    const flat = flattenDocument(doc);
    for (const key of Object.keys(flat)) {
      keySet.add(key);
    }
  }

  const columns: string[] = [];
  if (keySet.has('_id')) {
    columns.push('_id');
    keySet.delete('_id');
  }
  for (const key of keySet) {
    columns.push(key);
  }
  return columns;
}
