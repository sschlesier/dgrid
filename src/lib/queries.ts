// Query parser — pure string manipulation, no MongoDB driver dependency.
// Moved from src/backend/db/queries.ts (parser portion only).

type Document = Record<string, unknown>;

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
    | 'bulkWrite'
    | 'explain';
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
  hint?: Document | string; // For find().hint() — index spec or index name
  collation?: Document; // For find().collation()
  allowDiskUse?: boolean; // For find().allowDiskUse()
  maxTimeMS?: number; // For find().maxTimeMS()
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

function stripLeadingComments(query: string): string {
  let text = query;

  while (true) {
    text = text.trimStart();

    if (text.startsWith('//')) {
      const newlineIndex = text.indexOf('\n');
      if (newlineIndex === -1) {
        return '';
      }
      text = text.slice(newlineIndex + 1);
      continue;
    }

    if (text.startsWith('/*')) {
      const commentEnd = text.indexOf('*/', 2);
      if (commentEnd === -1) {
        return '';
      }
      text = text.slice(commentEnd + 2);
      continue;
    }

    return text;
  }
}

// Extract collection name and the index where the rest of the query begins,
// supporting dot notation, bracket notation, and db.getCollection().
interface CollectionAccess {
  collection: string;
  restIndex: number; // index in `text` where `.operation(` should begin
}

function extractCollectionAccess(text: string): CollectionAccess | null {
  // 1. db.getCollection('name') / db.getCollection("name")
  const getCollMatch = text.match(/^db\.getCollection\(\s*(['"])(.*?)\1\s*\)/);
  if (getCollMatch) {
    return { collection: getCollMatch[2], restIndex: getCollMatch[0].length };
  }

  // 2. db['name'] / db["name"]
  const bracketMatch = text.match(/^db\[(['"])(.*?)\1\]/);
  if (bracketMatch) {
    return { collection: bracketMatch[2], restIndex: bracketMatch[0].length };
  }

  // 3. db.name (dot notation — collection name must not contain dots or brackets)
  const dotMatch = text.match(/^db\.([^.[\]]+)/);
  if (dotMatch) {
    return { collection: dotMatch[1], restIndex: dotMatch[0].length };
  }

  return null;
}

// Detect if query is a db command or collection query
export function detectQueryType(query: string): 'db-command' | 'collection' {
  const trimmed = stripLeadingComments(query).trim();

  // Match db.methodName( pattern — only dot-notation can be a db command
  const dbMethodMatch = trimmed.match(/^db\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
  if (dbMethodMatch) {
    const methodName = dbMethodMatch[1];
    // If it's a known db command, treat it as db-command
    // (getCollection is NOT a db command — it accesses a collection)
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

// Shell helper arg utilities
function stripQuotes(s: string): string {
  const trimmed = s.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isIdentChar(ch: string): boolean {
  return /[a-zA-Z0-9_$]/.test(ch);
}

// Helpers that match with or without `new` prefix
type HelperHandler = (argsStr: string) => string;

const SHELL_HELPERS: Record<string, HelperHandler> = {
  ObjectId: (args) => `{"_type":"ObjectId","_value":"${stripQuotes(args)}"}`,
  ISODate: (args) => `{"_type":"Date","_value":"${stripQuotes(args)}"}`,
  NumberLong: (args) => `{"_type":"Long","_value":"${stripQuotes(args)}"}`,
  NumberInt: (args) => stripQuotes(args),
  NumberDecimal: (args) => `{"_type":"Decimal128","_value":"${stripQuotes(args)}"}`,
  UUID: (args) => `{"_type":"UUID","_value":"${stripQuotes(args)}"}`,
  BinData: (args) => {
    const commaIdx = args.indexOf(',');
    if (commaIdx === -1) return `{"_type":"Binary","_value":""}`;
    const b64 = stripQuotes(args.slice(commaIdx + 1));
    return `{"_type":"Binary","_value":"${b64}"}`;
  },
};

// Helpers that only match with `new` prefix
const NEW_ONLY_HELPERS: Record<string, HelperHandler> = {
  Date: (args) => `{"_type":"Date","_value":"${stripQuotes(args)}"}`,
};

interface HelperMatch {
  replacement: string;
  end: number;
}

function tryMatchHelper(str: string, i: number): HelperMatch | null {
  // Must be at a word boundary
  if (i > 0 && isIdentChar(str[i - 1])) return null;

  let j = i;
  let hasNew = false;

  // Check for `new` prefix
  if (str.slice(j, j + 3) === 'new' && (j + 3 >= str.length || !isIdentChar(str[j + 3]))) {
    hasNew = true;
    j += 3;
    while (j < str.length && /\s/.test(str[j])) j++;
  }

  // Read identifier
  const identStart = j;
  while (j < str.length && isIdentChar(str[j])) j++;
  const ident = str.slice(identStart, j);
  if (!ident) return null;

  // Skip whitespace before (
  while (j < str.length && (str[j] === ' ' || str[j] === '\t')) j++;
  if (j >= str.length || str[j] !== '(') return null;

  // Check if this is a known helper
  const handler = SHELL_HELPERS[ident] ?? (hasNew ? NEW_ONLY_HELPERS[ident] : undefined);
  if (!handler) return null;

  // Find matching close paren
  const closeParen = findMatchingBracket(str, j);
  if (closeParen === -1) return null;

  const argsStr = str.slice(j + 1, closeParen);
  return {
    replacement: handler(argsStr),
    end: closeParen + 1,
  };
}

// Convert MongoDB shell helper calls to tagged JSON format
// e.g., ObjectId("hex") -> {"_type":"ObjectId","_value":"hex"}
export function convertShellHelpers(str: string): string {
  let result = '';
  let i = 0;

  while (i < str.length) {
    // Skip strings
    if (str[i] === '"' || str[i] === "'") {
      const quote = str[i];
      result += str[i];
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
        result += str[i];
        i++;
      }
      continue;
    }

    // Try to match a shell helper (with optional `new` prefix)
    const helperMatch = tryMatchHelper(str, i);
    if (helperMatch) {
      result += helperMatch.replacement;
      i = helperMatch.end;
      continue;
    }

    result += str[i];
    i++;
  }

  return result;
}

function parseJavaScriptObject(str: string): Document {
  // Handle MongoDB shell syntax like { field: 1 } -> { "field": 1 }
  // This is a simplified parser - handles common cases

  // First, convert shell helpers like ObjectId("...") to tagged JSON format
  let normalized = convertShellHelpers(str);

  // Convert regex literals to $regex format (before other transformations)
  normalized = convertRegexLiterals(normalized);

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
): Pick<
  ParsedCollectionQuery,
  'sort' | 'limit' | 'skip' | 'hint' | 'collation' | 'allowDiskUse' | 'maxTimeMS' | 'projection'
> {
  const result: Pick<
    ParsedCollectionQuery,
    | 'sort'
    | 'limit'
    | 'skip'
    | 'hint'
    | 'collation'
    | 'allowDiskUse'
    | 'maxTimeMS'
    | 'projection'
  > = {};

  let i = 0;
  while (i < chain.length) {
    if (chain[i] !== '.') {
      i++;
      continue;
    }
    i++; // skip '.'

    // Read method name
    const methodStart = i;
    while (i < chain.length && /\w/.test(chain[i])) i++;
    const method = chain.slice(methodStart, i);
    if (!method) continue;

    // Skip whitespace before '('
    while (i < chain.length && /\s/.test(chain[i])) i++;
    if (i >= chain.length || chain[i] !== '(') continue;

    const closeIdx = findMatchingBracket(chain, i);
    if (closeIdx === -1) break;

    const args = chain.slice(i + 1, closeIdx).trim();
    i = closeIdx + 1;

    switch (method) {
      case 'sort':
        if (args) result.sort = parseJavaScriptObject(args);
        break;
      case 'limit':
        result.limit = parseInt(args, 10);
        break;
      case 'skip':
        result.skip = parseInt(args, 10);
        break;
      case 'hint':
        if (args) {
          result.hint = args.startsWith('{')
            ? parseJavaScriptObject(args)
            : args.replace(/['"]/g, '').trim();
        }
        break;
      case 'collation':
        if (args) result.collation = parseJavaScriptObject(args);
        break;
      case 'allowDiskUse':
        result.allowDiskUse = args.trim() !== 'false';
        break;
      case 'maxTimeMS':
        result.maxTimeMS = parseInt(args, 10);
        break;
      case 'projection':
      case 'project':
        if (args) result.projection = parseJavaScriptObject(args);
        break;
      // pretty() is shell-only formatting — silently ignore
    }
  }

  return result;
}

// Parse a database-level command (db.method())
export function parseDbCommand(queryText: string): Result<ParsedDbCommand, ParseError> {
  const text = stripLeadingComments(queryText).trim();

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
  const text = stripLeadingComments(queryText).trim();

  // Extract collection name using any supported syntax
  const access = extractCollectionAccess(text);
  if (!access) {
    return {
      ok: false,
      error: {
        message:
          "Query must start with db.<collection>.<operation>(, db['<collection>'].<operation>(, or db.getCollection('<collection>').<operation>(",
        position: 0,
      },
    };
  }

  const { collection } = access;

  // Match .operation( from the rest of the text
  const rest = text.slice(access.restIndex);
  const opMatch = rest.match(/^\.(\w+)\s*\(/);
  if (!opMatch) {
    return {
      ok: false,
      error: {
        message:
          "Query must start with db.<collection>.<operation>(, db['<collection>'].<operation>(, or db.getCollection('<collection>').<operation>(",
        position: 0,
      },
    };
  }

  const operation = opMatch[1];

  // Find the matching closing paren for the operation call
  const openParenIndex = access.restIndex + opMatch[0].length - 1;
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

        // .count() or .size() chained — treat as count operation
        if (/\.(?:count|size)\s*\(\s*\)/.test(chainStr)) {
          return {
            ok: true,
            value: {
              type: 'collection',
              collection,
              operation: 'count',
              filter: parsed.filter,
            },
          };
        }

        const chained = parseChainedMethods(chainStr);

        // .explain([verbosity]) chained — treat as explain operation
        const explainMatch = chainStr.match(/\.explain\s*\(\s*(?:['"]([^'"]*)['"]\s*)?\)/);
        if (explainMatch) {
          const verbosity = explainMatch[1] || 'queryPlanner';
          return {
            ok: true,
            value: {
              type: 'collection',
              collection,
              operation: 'explain',
              ...parsed,
              ...chained,
              options: { verbosity },
            },
          };
        }

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
            message: `Unsupported operation: ${operation}. Supported: find, findOne, aggregate, count, distinct, insertOne, insertMany, updateOne, updateMany, replaceOne, deleteOne, deleteMany, findOneAndUpdate, findOneAndReplace, findOneAndDelete, createIndex, dropIndex, getIndexes, bulkWrite, explain`,
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
