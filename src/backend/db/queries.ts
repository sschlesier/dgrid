import { Document, Db } from 'mongodb';

export interface ParsedQuery {
  collection: string;
  operation: 'find' | 'aggregate' | 'count' | 'distinct';
  filter?: Document;
  projection?: Document;
  sort?: Document;
  limit?: number;
  skip?: number;
  pipeline?: Document[];
  field?: string; // For distinct
}

export interface ParseError {
  message: string;
  position?: number;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

function parseJavaScriptObject(str: string): Document {
  // Handle MongoDB shell syntax like { field: 1 } -> { "field": 1 }
  // This is a simplified parser - handles common cases

  // Replace unquoted keys with quoted keys
  // Matches: key: or 'key': at start, after { or after ,
  let normalized = str.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');

  // Handle $operators - they should also be quoted
  normalized = normalized.replace(/([{,]\s*)\$([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$$2":');

  // Handle single quotes to double quotes (but not inside strings)
  normalized = normalized.replace(/'/g, '"');

  // Handle trailing commas
  normalized = normalized.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(normalized);
  } catch {
    throw new Error(`Invalid object syntax: ${str}`);
  }
}

function findMatchingBracket(str: string, start: number): number {
  const open = str[start];
  const close = open === '(' ? ')' : open === '[' ? ']' : open === '{' ? '}' : '';
  if (!close) return -1;

  let depth = 1;
  let inString = false;
  let stringChar = '';

  for (let i = start + 1; i < str.length; i++) {
    const char = str[i];

    if (inString) {
      if (char === stringChar && str[i - 1] !== '\\') {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === open) depth++;
    else if (char === close) depth--;

    if (depth === 0) return i;
  }

  return -1;
}

function parseChainedMethods(chain: string): Pick<ParsedQuery, 'sort' | 'limit' | 'skip'> {
  const result: Pick<ParsedQuery, 'sort' | 'limit' | 'skip'> = {};

  // Match .method(args) patterns
  const methodPattern = /\.(\w+)\(([^)]*)\)/g;
  let match;

  while ((match = methodPattern.exec(chain)) !== null) {
    const [, method, args] = match;

    switch (method) {
      case 'sort':
        result.sort = parseJavaScriptObject(args.trim());
        break;
      case 'limit':
        result.limit = parseInt(args.trim(), 10);
        break;
      case 'skip':
        result.skip = parseInt(args.trim(), 10);
        break;
    }
  }

  return result;
}

export function parseQuery(queryText: string): Result<ParsedQuery, ParseError> {
  const text = queryText.trim();

  // Match db.collection.operation(...)
  const basePattern = /^db\.([a-zA-Z_$][a-zA-Z0-9_$]*)\.(\w+)\s*\(/;
  const baseMatch = text.match(basePattern);

  if (!baseMatch) {
    return {
      ok: false,
      error: {
        message: 'Query must start with db.<collection>.<operation>(',
        position: 0,
      },
    };
  }

  const collection = baseMatch[1];
  const operation = baseMatch[2];

  // Find the matching closing paren for the operation call
  const openParenIndex = baseMatch[0].length - 1;
  const closeParenIndex = findMatchingBracket(text, openParenIndex);

  if (closeParenIndex === -1) {
    return {
      ok: false,
      error: {
        message: 'Unmatched parenthesis',
        position: openParenIndex,
      },
    };
  }

  const argsStr = text.slice(openParenIndex + 1, closeParenIndex).trim();
  const chainStr = text.slice(closeParenIndex + 1).trim();

  try {
    switch (operation) {
      case 'find': {
        const parsed = parseFindArgs(argsStr);
        const chained = parseChainedMethods(chainStr);
        return {
          ok: true,
          value: {
            collection,
            operation: 'find',
            ...parsed,
            ...chained,
          },
        };
      }

      case 'aggregate': {
        const pipeline = parseJavaScriptObject(
          `[${argsStr}]`.replace('[[', '[').replace(']]', ']')
        );
        // Handle case where argsStr is already an array
        const normalizedPipeline = Array.isArray(pipeline) ? pipeline : [pipeline];
        return {
          ok: true,
          value: {
            collection,
            operation: 'aggregate',
            pipeline: normalizedPipeline as Document[],
          },
        };
      }

      case 'count':
      case 'countDocuments': {
        const filter = argsStr ? parseJavaScriptObject(argsStr) : {};
        return {
          ok: true,
          value: {
            collection,
            operation: 'count',
            filter,
          },
        };
      }

      case 'distinct': {
        // distinct('field') or distinct('field', filter)
        const parts = splitArgs(argsStr);
        const field = parts[0]?.replace(/['"]/g, '').trim();
        const filter = parts[1] ? parseJavaScriptObject(parts[1]) : undefined;

        if (!field) {
          return {
            ok: false,
            error: { message: 'distinct requires a field name' },
          };
        }

        return {
          ok: true,
          value: {
            collection,
            operation: 'distinct',
            field,
            filter,
          },
        };
      }

      default:
        return {
          ok: false,
          error: {
            message: `Unsupported operation: ${operation}. Supported: find, aggregate, count, distinct`,
          },
        };
    }
  } catch (e) {
    return {
      ok: false,
      error: {
        message: e instanceof Error ? e.message : 'Parse error',
      },
    };
  }
}

function parseFindArgs(argsStr: string): Pick<ParsedQuery, 'filter' | 'projection'> {
  if (!argsStr) {
    return { filter: {} };
  }

  const parts = splitArgs(argsStr);

  const filter = parts[0] ? parseJavaScriptObject(parts[0]) : {};
  const projection = parts[1] ? parseJavaScriptObject(parts[1]) : undefined;

  return { filter, projection };
}

function splitArgs(argsStr: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < argsStr.length; i++) {
    const char = argsStr[i];

    if (inString) {
      current += char;
      if (char === stringChar && argsStr[i - 1] !== '\\') {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringChar = char;
      current += char;
      continue;
    }

    if (char === '{' || char === '[' || char === '(') {
      depth++;
      current += char;
    } else if (char === '}' || char === ']' || char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

// Query Executor

export interface QueryResult {
  documents: Document[];
  totalCount: number;
  executionTimeMs: number;
  hasMore: boolean;
}

export interface QueryError {
  message: string;
  code?: string;
}

export interface QueryOptions {
  page?: number;
  pageSize?: 50 | 100 | 250 | 500;
  timeoutMs?: number;
}

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_TIMEOUT_MS = 30000;

export async function executeQuery(
  db: Db,
  query: ParsedQuery,
  options: QueryOptions = {}
): Promise<Result<QueryResult, QueryError>> {
  const { page = 1, pageSize = DEFAULT_PAGE_SIZE, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const skip = (page - 1) * pageSize;

  const startTime = Date.now();

  try {
    const collection = db.collection(query.collection);

    switch (query.operation) {
      case 'find': {
        const filter = query.filter ?? {};
        const findOptions = {
          projection: query.projection,
          sort: query.sort,
          maxTimeMS: timeoutMs,
        };

        // Get total count for pagination
        const totalCount = await collection.countDocuments(filter, { maxTimeMS: timeoutMs });

        // Build cursor with pagination
        let cursor = collection.find(filter, findOptions);

        // Apply query-level skip first, then pagination skip
        const querySkip = query.skip ?? 0;
        cursor = cursor.skip(querySkip + skip);

        // Use query limit if smaller than pageSize, otherwise use pageSize
        const effectiveLimit = query.limit ? Math.min(query.limit, pageSize) : pageSize;
        cursor = cursor.limit(effectiveLimit);

        const documents = await cursor.toArray();
        const executionTimeMs = Date.now() - startTime;

        // Calculate hasMore based on total count and current position
        const hasMore = querySkip + skip + documents.length < totalCount;

        return {
          ok: true,
          value: {
            documents,
            totalCount,
            executionTimeMs,
            hasMore,
          },
        };
      }

      case 'aggregate': {
        const pipeline = query.pipeline ?? [];

        // Add $skip and $limit for pagination if not already in pipeline
        const paginatedPipeline = [...pipeline, { $skip: skip }, { $limit: pageSize }];

        const documents = await collection
          .aggregate(paginatedPipeline, { maxTimeMS: timeoutMs })
          .toArray();

        // For aggregates, getting total count requires running a separate count pipeline
        const countPipeline = [...pipeline, { $count: 'total' }];
        const countResult = await collection
          .aggregate(countPipeline, { maxTimeMS: timeoutMs })
          .toArray();
        const totalCount = countResult[0]?.total ?? documents.length;

        const executionTimeMs = Date.now() - startTime;

        return {
          ok: true,
          value: {
            documents,
            totalCount,
            executionTimeMs,
            hasMore: skip + documents.length < totalCount,
          },
        };
      }

      case 'count': {
        const filter = query.filter ?? {};
        const count = await collection.countDocuments(filter, { maxTimeMS: timeoutMs });
        const executionTimeMs = Date.now() - startTime;

        return {
          ok: true,
          value: {
            documents: [{ count }],
            totalCount: 1,
            executionTimeMs,
            hasMore: false,
          },
        };
      }

      case 'distinct': {
        if (!query.field) {
          return {
            ok: false,
            error: { message: 'distinct requires a field name' },
          };
        }

        const values = await collection.distinct(query.field, query.filter ?? {}, {
          maxTimeMS: timeoutMs,
        });
        const executionTimeMs = Date.now() - startTime;

        // Return distinct values as documents with value field
        const documents = values.map((value) => ({ value }));

        return {
          ok: true,
          value: {
            documents,
            totalCount: values.length,
            executionTimeMs,
            hasMore: false,
          },
        };
      }

      default:
        return {
          ok: false,
          error: { message: `Unsupported operation: ${query.operation}` },
        };
    }
  } catch (e) {
    const error = e as Error & { code?: number; codeName?: string };

    // Handle timeout
    if (error.code === 50 || error.codeName === 'MaxTimeMSExpired') {
      return {
        ok: false,
        error: {
          message: 'Query execution timed out',
          code: 'TIMEOUT',
        },
      };
    }

    return {
      ok: false,
      error: {
        message: error.message ?? 'Query execution failed',
        code: error.codeName,
      },
    };
  }
}
