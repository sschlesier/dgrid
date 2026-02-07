// Schema Store - caches field names per collection for autocomplete

import * as api from '../api/client';

function cacheKey(connectionId: string, database: string, collection: string): string {
  return `${connectionId}:${database}:${collection}`;
}

/** Recursively extract dot-notation field paths from serialized documents.
 *  Skips BSON wrapper objects (those with _type/_value keys). */
export function extractFieldPaths(docs: Record<string, unknown>[]): string[] {
  const paths = new Set<string>();

  function walk(obj: unknown, prefix: string) {
    if (obj === null || obj === undefined || typeof obj !== 'object' || Array.isArray(obj)) {
      return;
    }

    const record = obj as Record<string, unknown>;

    // Detect BSON wrapper: { _type: "...", _value: "..." }
    if ('_type' in record && '_value' in record && Object.keys(record).length === 2) {
      return;
    }

    for (const key of Object.keys(record)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      paths.add(fullKey);

      const value = record[key];
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        walk(value, fullKey);
      }
    }
  }

  for (const doc of docs) {
    walk(doc, '');
  }

  return Array.from(paths).sort();
}

class SchemaStore {
  private cache = new Map<string, Set<string>>();
  private pending = new Set<string>();

  async fetchSchema(connectionId: string, database: string, collection: string): Promise<void> {
    const key = cacheKey(connectionId, database, collection);

    // Skip if already fetching
    if (this.pending.has(key)) return;

    this.pending.add(key);
    try {
      const result = await api.getCollectionSchema(connectionId, database, collection);
      const existing = this.cache.get(key) ?? new Set<string>();
      for (const field of result.fields) {
        existing.add(field);
      }
      this.cache.set(key, existing);
    } catch {
      // Silently fail - autocomplete is best-effort
    } finally {
      this.pending.delete(key);
    }
  }

  enrichFromDocuments(
    connectionId: string,
    database: string,
    collection: string,
    docs: Record<string, unknown>[]
  ): void {
    const key = cacheKey(connectionId, database, collection);
    const existing = this.cache.get(key) ?? new Set<string>();
    const paths = extractFieldPaths(docs);
    for (const path of paths) {
      existing.add(path);
    }
    this.cache.set(key, existing);
  }

  getFields(connectionId: string, database: string, collection: string): string[] {
    const key = cacheKey(connectionId, database, collection);
    const fields = this.cache.get(key);
    return fields ? Array.from(fields).sort() : [];
  }

  clearConnection(connectionId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${connectionId}:`)) {
        this.cache.delete(key);
      }
    }
  }
}

export const schemaStore = new SchemaStore();
