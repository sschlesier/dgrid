import { Document, Db, type AnyBulkWriteOperation } from 'mongodb';

// Collection-level query (db.collection.method())
export interface ParsedCollectionQuery {
  type: 'collection';
  collection: string;
  operation:
    | 'find'
    | 'findOne'
    | 'aggregate'
    | 'count'
    | 'distinct'
    | 'insertOne'
    | 'insertMany'
    | 'updateOne'
    | 'updateMany'
    | 'replaceOne'
    | 'deleteOne'
    | 'deleteMany'
    | 'findOneAndUpdate'
    | 'findOneAndReplace'
    | 'findOneAndDelete'
    | 'createIndex'
    | 'dropIndex'
    | 'getIndexes'
    | 'bulkWrite';
  filter?: Document;
  projection?: Document;
  sort?: Document;
  limit?: number;
  skip?: number;
  pipeline?: Document[];
  field?: string; // For distinct
  document?: Document; // For insertOne
  documents?: Document[]; // For insertMany
  update?: Document; // For updateOne, updateMany, findOneAndUpdate
  replacement?: Document; // For replaceOne, findOneAndReplace
  options?: Document; // For operations with options (upsert, returnDocument, etc.)
  indexSpec?: Document; // For createIndex keys
  indexName?: string; // For dropIndex
  operations?: Document[]; // For bulkWrite
}

// Database-level command (db.method())
export interface ParsedDbCommand {
  type: 'db-command';
  command: string;
  args: unknown[];
}

export type ParsedQuery = ParsedCollectionQuery | ParsedDbCommand;

// Supported database commands with their argument signatures
export type DbCommandSignature = {
  argTypes: ('none' | 'string' | 'object' | 'any')[];
  minArgs: number;
  maxArgs: number;
};

export const DB_COMMAND_SIGNATURES: Record<string, DbCommandSignature> = {
  // Database info commands
  getCollectionNames: { argTypes: [], minArgs: 0, maxArgs: 0 },
  listCollections: { argTypes: ['object'], minArgs: 0, maxArgs: 1 },
  stats: { argTypes: ['object'], minArgs: 0, maxArgs: 1 },
  serverStatus: { argTypes: [], minArgs: 0, maxArgs: 0 },
  hostInfo: { argTypes: [], minArgs: 0, maxArgs: 0 },
  version: { argTypes: [], minArgs: 0, maxArgs: 0 },

  // Collection management
  createCollection: { argTypes: ['string', 'object'], minArgs: 1, maxArgs: 2 },
  dropCollection: { argTypes: ['string'], minArgs: 1, maxArgs: 1 },
  renameCollection: { argTypes: ['string', 'string'], minArgs: 2, maxArgs: 2 },

  // Index commands
  getCollectionInfos: { argTypes: ['object'], minArgs: 0, maxArgs: 1 },

  // Admin commands
  currentOp: { argTypes: ['object'], minArgs: 0, maxArgs: 1 },
  killOp: { argTypes: ['any'], minArgs: 1, maxArgs: 1 },

  // Generic command runner
  runCommand: { argTypes: ['object'], minArgs: 1, maxArgs: 1 },
  adminCommand: { argTypes: ['object'], minArgs: 1, maxArgs: 1 },
};

export interface ParseError {
  message: string;
  position?: number;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// Detect if query is a db command or collection query
export function detectQueryType(query: string): 'db-command' | 'collection' {
  const trimmed = query.trim();

  // Match db.methodName( pattern
  const dbMethodMatch = trimmed.match(/^db\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
  if (dbMethodMatch) {
    const methodName = dbMethodMatch[1];
    // If it's a known db command, treat it as db-command
    if (methodName in DB_COMMAND_SIGNATURES) {
      return 'db-command';
    }
  }

  // Default to collection query (db.collection.method pattern)
  return 'collection';
}

// Convert JavaScript regex literals to MongoDB $regex format
// e.g., /^B/ -> {"$regex": "^B"} or /^B/i -> {"$regex": "^B", "$options": "i"}
function convertRegexLiterals(str: string): string {
  let result = '';
  let i = 0;

  while (i < str.length) {
    const char = str[i];

    // Skip strings
    if (char === '"' || char === "'") {
      const quote = char;
      result += char;
      i++;
      while (i < str.length && str[i] !== quote) {
        if (str[i] === '\\' && i + 1 < str.length) {
          result += str[i] + str[i + 1];
          i += 2;
        } else {
          result += str[i];
          i++;
        }
      }
      if (i < str.length) {
        result += str[i]; // closing quote
        i++;
      }
      continue;
    }

    // Check for regex literal (must be preceded by : or , or [ or whitespace after these)
    if (char === '/') {
      // Look back to see if this could be a regex (after : , [ or start)
      const before = result.trimEnd();
      const lastChar = before[before.length - 1];
      if (lastChar === ':' || lastChar === ',' || lastChar === '[' || before.length === 0) {
        // Parse the regex literal
        let pattern = '';
        let flags = '';
        i++; // skip opening /

        // Read pattern (handle escaped slashes)
        while (i < str.length && str[i] !== '/') {
          if (str[i] === '\\' && i + 1 < str.length) {
            pattern += str[i] + str[i + 1];
            i += 2;
          } else {
            pattern += str[i];
            i++;
          }
        }

        if (i < str.length) {
          i++; // skip closing /

          // Read optional flags (i, m, s, x, g, u)
          while (i < str.length && /[imsgxu]/.test(str[i])) {
            flags += str[i];
            i++;
          }
        }

        // Escape the pattern for JSON string
        const escapedPattern = pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

        // Convert to MongoDB $regex format
        if (flags) {
          result += `{"$regex": "${escapedPattern}", "$options": "${flags}"}`;
        } else {
          result += `{"$regex": "${escapedPattern}"}`;
        }
        continue;
      }
    }

    result += char;
    i++;
  }

  return result;
}

function parseJavaScriptObject(str: string): Document {
  // Handle MongoDB shell syntax like { field: 1 } -> { "field": 1 }
  // This is a simplified parser - handles common cases

  // First, convert regex literals to $regex format (before other transformations)
  let normalized = convertRegexLiterals(str);

  // Replace unquoted keys with quoted keys
  // Matches: key: or 'key': at start, after { or after ,
  normalized = normalized.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');

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

function parseChainedMethods(
  chain: string
): Pick<ParsedCollectionQuery, 'sort' | 'limit' | 'skip'> {
  const result: Pick<ParsedCollectionQuery, 'sort' | 'limit' | 'skip'> = {};

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

// Parse a database-level command (db.method())
export function parseDbCommand(queryText: string): Result<ParsedDbCommand, ParseError> {
  const text = queryText.trim();

  // Match db.method(...)
  const dbMethodPattern = /^db\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/;
  const match = text.match(dbMethodPattern);

  if (!match) {
    return {
      ok: false,
      error: {
        message: 'Database command must start with db.<method>(',
        position: 0,
      },
    };
  }

  const command = match[1];
  const signature = DB_COMMAND_SIGNATURES[command];

  if (!signature) {
    const supported = Object.keys(DB_COMMAND_SIGNATURES).join(', ');
    return {
      ok: false,
      error: {
        message: `Unsupported database command: ${command}. Supported: ${supported}`,
      },
    };
  }

  // Find matching paren for arguments
  const openParenIndex = match[0].length - 1;
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

  // Parse arguments
  let args: unknown[] = [];
  if (argsStr) {
    const argParts = splitArgs(argsStr);
    args = argParts.map((arg) => {
      const trimmed = arg.trim();
      // String argument
      if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ) {
        return trimmed.slice(1, -1);
      }
      // Object/array argument
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return parseJavaScriptObject(trimmed);
      }
      // Number
      if (!isNaN(Number(trimmed))) {
        return Number(trimmed);
      }
      // Boolean
      if (trimmed === 'true') return true;
      if (trimmed === 'false') return false;
      // Null
      if (trimmed === 'null') return null;
      // Return as string
      return trimmed;
    });
  }

  // Validate argument count
  if (args.length < signature.minArgs) {
    return {
      ok: false,
      error: {
        message: `${command} requires at least ${signature.minArgs} argument(s), got ${args.length}`,
      },
    };
  }

  if (args.length > signature.maxArgs) {
    return {
      ok: false,
      error: {
        message: `${command} accepts at most ${signature.maxArgs} argument(s), got ${args.length}`,
      },
    };
  }

  return {
    ok: true,
    value: {
      type: 'db-command',
      command,
      args,
    },
  };
}

// Parse a collection-level query (db.collection.method())
export function parseCollectionQuery(queryText: string): Result<ParsedCollectionQuery, ParseError> {
  const text = queryText.trim();

  // Match db.collection.operation(...) — collection name is any non-dot chars; MongoDB validates the name
  const basePattern = /^db\.([^.]+)\.(\w+)\s*\(/;
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
            type: 'collection',
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
            type: 'collection',
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
            type: 'collection',
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
            type: 'collection',
            collection,
            operation: 'distinct',
            field,
            filter,
          },
        };
      }

      case 'findOne': {
        const parsed = parseFindArgs(argsStr);
        return {
          ok: true,
          value: {
            type: 'collection',
            collection,
            operation: 'findOne',
            ...parsed,
          },
        };
      }

      case 'insertOne': {
        if (!argsStr) {
          return {
            ok: false,
            error: { message: 'insertOne requires a document argument' },
          };
        }
        const document = parseJavaScriptObject(argsStr);
        return {
          ok: true,
          value: {
            type: 'collection',
            collection,
            operation: 'insertOne',
            document,
          },
        };
      }

      case 'insertMany': {
        if (!argsStr) {
          return {
            ok: false,
            error: { message: 'insertMany requires an array of documents' },
          };
        }
        const parsed = parseJavaScriptObject(`[${argsStr}]`.replace('[[', '[').replace(']]', ']'));
        const documents = Array.isArray(parsed) ? (parsed as Document[]) : [parsed];
        return {
          ok: true,
          value: {
            type: 'collection',
            collection,
            operation: 'insertMany',
            documents,
          },
        };
      }

      case 'updateOne':
      case 'updateMany': {
        const parts = splitArgs(argsStr);
        if (parts.length < 2) {
          return {
            ok: false,
            error: { message: `${operation} requires at least 2 arguments (filter, update)` },
          };
        }
        const filter = parseJavaScriptObject(parts[0]);
        const update = parseJavaScriptObject(parts[1]);
        const options = parts[2] ? parseJavaScriptObject(parts[2]) : undefined;
        return {
          ok: true,
          value: {
            type: 'collection',
            collection,
            operation,
            filter,
            update,
            options,
          },
        };
      }

      case 'replaceOne': {
        const parts = splitArgs(argsStr);
        if (parts.length < 2) {
          return {
            ok: false,
            error: { message: 'replaceOne requires at least 2 arguments (filter, replacement)' },
          };
        }
        const filter = parseJavaScriptObject(parts[0]);
        const replacement = parseJavaScriptObject(parts[1]);
        const options = parts[2] ? parseJavaScriptObject(parts[2]) : undefined;
        return {
          ok: true,
          value: {
            type: 'collection',
            collection,
            operation: 'replaceOne',
            filter,
            replacement,
            options,
          },
        };
      }

      case 'deleteOne':
      case 'deleteMany': {
        const filter = argsStr ? parseJavaScriptObject(argsStr) : {};
        return {
          ok: true,
          value: {
            type: 'collection',
            collection,
            operation,
            filter,
          },
        };
      }

      case 'findOneAndUpdate': {
        const parts = splitArgs(argsStr);
        if (parts.length < 2) {
          return {
            ok: false,
            error: {
              message: 'findOneAndUpdate requires at least 2 arguments (filter, update)',
            },
          };
        }
        const filter = parseJavaScriptObject(parts[0]);
        const update = parseJavaScriptObject(parts[1]);
        const options = parts[2] ? parseJavaScriptObject(parts[2]) : undefined;
        return {
          ok: true,
          value: {
            type: 'collection',
            collection,
            operation: 'findOneAndUpdate',
            filter,
            update,
            options,
          },
        };
      }

      case 'findOneAndReplace': {
        const parts = splitArgs(argsStr);
        if (parts.length < 2) {
          return {
            ok: false,
            error: {
              message: 'findOneAndReplace requires at least 2 arguments (filter, replacement)',
            },
          };
        }
        const filter = parseJavaScriptObject(parts[0]);
        const replacement = parseJavaScriptObject(parts[1]);
        const options = parts[2] ? parseJavaScriptObject(parts[2]) : undefined;
        return {
          ok: true,
          value: {
            type: 'collection',
            collection,
            operation: 'findOneAndReplace',
            filter,
            replacement,
            options,
          },
        };
      }

      case 'findOneAndDelete': {
        const parts = splitArgs(argsStr);
        const filter = parts[0] ? parseJavaScriptObject(parts[0]) : {};
        const options = parts[1] ? parseJavaScriptObject(parts[1]) : undefined;
        return {
          ok: true,
          value: {
            type: 'collection',
            collection,
            operation: 'findOneAndDelete',
            filter,
            options,
          },
        };
      }

      case 'createIndex': {
        const parts = splitArgs(argsStr);
        if (parts.length < 1 || !argsStr) {
          return {
            ok: false,
            error: { message: 'createIndex requires at least 1 argument (index specification)' },
          };
        }
        const indexSpec = parseJavaScriptObject(parts[0]);
        const options = parts[1] ? parseJavaScriptObject(parts[1]) : undefined;
        return {
          ok: true,
          value: {
            type: 'collection',
            collection,
            operation: 'createIndex',
            indexSpec,
            options,
          },
        };
      }

      case 'dropIndex': {
        if (!argsStr) {
          return {
            ok: false,
            error: { message: 'dropIndex requires an index name argument' },
          };
        }
        const indexName = argsStr.replace(/['"]/g, '').trim();
        return {
          ok: true,
          value: {
            type: 'collection',
            collection,
            operation: 'dropIndex',
            indexName,
          },
        };
      }

      case 'getIndexes':
      case 'indexes': {
        return {
          ok: true,
          value: {
            type: 'collection',
            collection,
            operation: 'getIndexes',
          },
        };
      }

      case 'bulkWrite': {
        if (!argsStr) {
          return {
            ok: false,
            error: { message: 'bulkWrite requires an array of operations' },
          };
        }
        const parsed = parseJavaScriptObject(`[${argsStr}]`.replace('[[', '[').replace(']]', ']'));
        const operations = Array.isArray(parsed) ? (parsed as Document[]) : [parsed];
        return {
          ok: true,
          value: {
            type: 'collection',
            collection,
            operation: 'bulkWrite',
            operations,
          },
        };
      }

      default:
        return {
          ok: false,
          error: {
            message: `Unsupported operation: ${operation}. Supported: find, findOne, aggregate, count, distinct, insertOne, insertMany, updateOne, updateMany, replaceOne, deleteOne, deleteMany, findOneAndUpdate, findOneAndReplace, findOneAndDelete, createIndex, dropIndex, getIndexes, bulkWrite`,
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

function parseFindArgs(argsStr: string): Pick<ParsedCollectionQuery, 'filter' | 'projection'> {
  if (!argsStr) {
    return { filter: {} };
  }

  const parts = splitArgs(argsStr);

  const filter = parts[0] ? parseJavaScriptObject(parts[0]) : {};
  const projection = parts[1] ? parseJavaScriptObject(parts[1]) : undefined;

  return { filter, projection };
}

// Unified parser that handles both db commands and collection queries
export function parseQuery(queryText: string): Result<ParsedQuery, ParseError> {
  const queryType = detectQueryType(queryText);

  if (queryType === 'db-command') {
    return parseDbCommand(queryText);
  }

  return parseCollectionQuery(queryText);
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
  cause?: unknown;
}

export interface QueryOptions {
  page?: number;
  pageSize?: 50 | 100 | 250 | 500;
  timeoutMs?: number;
}

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_TIMEOUT_MS = 30000;

// Execute a database-level command
export async function executeDbCommand(
  db: Db,
  command: ParsedDbCommand,
  options: QueryOptions = {}
): Promise<Result<QueryResult, QueryError>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const startTime = Date.now();

  try {
    let result: Document | Document[];

    switch (command.command) {
      case 'getCollectionNames': {
        const collections = await db.listCollections({}, { maxTimeMS: timeoutMs }).toArray();
        result = collections.map((c) => c.name).sort();
        break;
      }

      case 'listCollections': {
        const filter = (command.args[0] as Document) ?? {};
        result = await db.listCollections(filter, { maxTimeMS: timeoutMs }).toArray();
        break;
      }

      case 'stats': {
        const scale = (command.args[0] as Document)?.scale ?? 1;
        result = await db.stats({ scale });
        break;
      }

      case 'serverStatus': {
        result = await db.admin().serverStatus();
        break;
      }

      case 'hostInfo': {
        result = await db.admin().command({ hostInfo: 1 });
        break;
      }

      case 'version': {
        const buildInfo = await db.admin().command({ buildInfo: 1 });
        result = { version: buildInfo.version };
        break;
      }

      case 'createCollection': {
        const name = command.args[0] as string;
        const opts = (command.args[1] as Document) ?? {};
        await db.createCollection(name, opts);
        result = { ok: 1, message: `Collection '${name}' created` };
        break;
      }

      case 'dropCollection': {
        const name = command.args[0] as string;
        const dropped = await db.dropCollection(name);
        result = { ok: dropped ? 1 : 0, dropped };
        break;
      }

      case 'renameCollection': {
        const fromName = command.args[0] as string;
        const toName = command.args[1] as string;
        await db.renameCollection(fromName, toName);
        result = { ok: 1, message: `Collection renamed from '${fromName}' to '${toName}'` };
        break;
      }

      case 'getCollectionInfos': {
        const filter = (command.args[0] as Document) ?? {};
        result = await db.listCollections(filter, { maxTimeMS: timeoutMs }).toArray();
        break;
      }

      case 'currentOp': {
        const opts = (command.args[0] as Document) ?? {};
        result = await db.admin().command({ currentOp: 1, ...opts });
        break;
      }

      case 'killOp': {
        const opId = command.args[0];
        result = await db.admin().command({ killOp: 1, op: opId });
        break;
      }

      case 'runCommand': {
        const cmd = command.args[0] as Document;
        result = await db.command(cmd);
        break;
      }

      case 'adminCommand': {
        const cmd = command.args[0] as Document;
        result = await db.admin().command(cmd);
        break;
      }

      default:
        return {
          ok: false,
          error: { message: `Unsupported database command: ${command.command}` },
        };
    }

    const executionTimeMs = Date.now() - startTime;

    // Normalize result to array of documents
    const documents: Document[] = Array.isArray(result)
      ? result.map((item) => (typeof item === 'object' ? item : { value: item }))
      : [result];

    return {
      ok: true,
      value: {
        documents,
        totalCount: documents.length,
        executionTimeMs,
        hasMore: false,
      },
    };
  } catch (e) {
    const error = e as Error & { code?: number; codeName?: string };

    if (error.code === 50 || error.codeName === 'MaxTimeMSExpired') {
      return {
        ok: false,
        error: {
          message: 'Command execution timed out',
          code: 'TIMEOUT',
        },
      };
    }

    return {
      ok: false,
      error: {
        message: error.message ?? 'Command execution failed',
        code: error.codeName,
        cause: e,
      },
    };
  }
}

// Execute a collection-level query
export async function executeCollectionQuery(
  db: Db,
  query: ParsedCollectionQuery,
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

      case 'findOne': {
        const filter = query.filter ?? {};
        const doc = await collection.findOne(filter, {
          projection: query.projection,
          maxTimeMS: timeoutMs,
        });
        const executionTimeMs = Date.now() - startTime;

        return {
          ok: true,
          value: {
            documents: doc ? [doc] : [],
            totalCount: doc ? 1 : 0,
            executionTimeMs,
            hasMore: false,
          },
        };
      }

      case 'insertOne': {
        const result = await collection.insertOne(query.document ?? {});
        const executionTimeMs = Date.now() - startTime;

        return {
          ok: true,
          value: {
            documents: [
              {
                acknowledged: result.acknowledged,
                insertedId: result.insertedId,
              },
            ],
            totalCount: 1,
            executionTimeMs,
            hasMore: false,
          },
        };
      }

      case 'insertMany': {
        const result = await collection.insertMany(query.documents ?? []);
        const executionTimeMs = Date.now() - startTime;

        return {
          ok: true,
          value: {
            documents: [
              {
                acknowledged: result.acknowledged,
                insertedCount: result.insertedCount,
                insertedIds: result.insertedIds,
              },
            ],
            totalCount: 1,
            executionTimeMs,
            hasMore: false,
          },
        };
      }

      case 'updateOne':
      case 'updateMany': {
        const result = await collection[query.operation](
          query.filter ?? {},
          query.update ?? {},
          query.options
        );
        const executionTimeMs = Date.now() - startTime;

        return {
          ok: true,
          value: {
            documents: [
              {
                acknowledged: result.acknowledged,
                matchedCount: result.matchedCount,
                modifiedCount: result.modifiedCount,
                upsertedCount: result.upsertedCount,
                upsertedId: result.upsertedId,
              },
            ],
            totalCount: 1,
            executionTimeMs,
            hasMore: false,
          },
        };
      }

      case 'replaceOne': {
        const result = await collection.replaceOne(
          query.filter ?? {},
          query.replacement ?? {},
          query.options
        );
        const executionTimeMs = Date.now() - startTime;

        return {
          ok: true,
          value: {
            documents: [
              {
                acknowledged: result.acknowledged,
                matchedCount: result.matchedCount,
                modifiedCount: result.modifiedCount,
                upsertedCount: result.upsertedCount,
                upsertedId: result.upsertedId,
              },
            ],
            totalCount: 1,
            executionTimeMs,
            hasMore: false,
          },
        };
      }

      case 'deleteOne':
      case 'deleteMany': {
        const result = await collection[query.operation](query.filter ?? {});
        const executionTimeMs = Date.now() - startTime;

        return {
          ok: true,
          value: {
            documents: [
              {
                acknowledged: result.acknowledged,
                deletedCount: result.deletedCount,
              },
            ],
            totalCount: 1,
            executionTimeMs,
            hasMore: false,
          },
        };
      }

      case 'findOneAndUpdate': {
        const result = await collection.findOneAndUpdate(query.filter ?? {}, query.update ?? {}, {
          ...query.options,
          includeResultMetadata: true,
        });
        const executionTimeMs = Date.now() - startTime;
        const doc = result.value;

        return {
          ok: true,
          value: {
            documents: doc ? [doc] : [{ value: null }],
            totalCount: 1,
            executionTimeMs,
            hasMore: false,
          },
        };
      }

      case 'findOneAndReplace': {
        const result = await collection.findOneAndReplace(
          query.filter ?? {},
          query.replacement ?? {},
          { ...query.options, includeResultMetadata: true }
        );
        const executionTimeMs = Date.now() - startTime;
        const doc = result.value;

        return {
          ok: true,
          value: {
            documents: doc ? [doc] : [{ value: null }],
            totalCount: 1,
            executionTimeMs,
            hasMore: false,
          },
        };
      }

      case 'findOneAndDelete': {
        const result = await collection.findOneAndDelete(query.filter ?? {}, {
          ...query.options,
          includeResultMetadata: true,
        });
        const executionTimeMs = Date.now() - startTime;
        const doc = result.value;

        return {
          ok: true,
          value: {
            documents: doc ? [doc] : [{ value: null }],
            totalCount: 1,
            executionTimeMs,
            hasMore: false,
          },
        };
      }

      case 'createIndex': {
        const indexName = await collection.createIndex(query.indexSpec ?? {}, query.options ?? {});
        const executionTimeMs = Date.now() - startTime;

        return {
          ok: true,
          value: {
            documents: [{ indexName }],
            totalCount: 1,
            executionTimeMs,
            hasMore: false,
          },
        };
      }

      case 'dropIndex': {
        await collection.dropIndex(query.indexName ?? '');
        const executionTimeMs = Date.now() - startTime;

        return {
          ok: true,
          value: {
            documents: [{ ok: 1, message: `Index '${query.indexName}' dropped` }],
            totalCount: 1,
            executionTimeMs,
            hasMore: false,
          },
        };
      }

      case 'getIndexes': {
        const indexes = await collection.indexes();
        const executionTimeMs = Date.now() - startTime;

        return {
          ok: true,
          value: {
            documents: indexes,
            totalCount: indexes.length,
            executionTimeMs,
            hasMore: false,
          },
        };
      }

      case 'bulkWrite': {
        const result = await collection.bulkWrite(
          (query.operations ?? []) as AnyBulkWriteOperation<Document>[]
        );
        const executionTimeMs = Date.now() - startTime;

        return {
          ok: true,
          value: {
            documents: [
              {
                insertedCount: result.insertedCount,
                matchedCount: result.matchedCount,
                modifiedCount: result.modifiedCount,
                deletedCount: result.deletedCount,
                upsertedCount: result.upsertedCount,
              },
            ],
            totalCount: 1,
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
        cause: e,
      },
    };
  }
}

// Unified query executor that handles both db commands and collection queries
export async function executeQuery(
  db: Db,
  query: ParsedQuery,
  options: QueryOptions = {}
): Promise<Result<QueryResult, QueryError>> {
  if (query.type === 'db-command') {
    return executeDbCommand(db, query, options);
  }

  return executeCollectionQuery(db, query, options);
}
