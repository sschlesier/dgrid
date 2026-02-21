import { Document, Db, type AnyBulkWriteOperation } from 'mongodb';

// Re-export parser types and functions from shared (moved in Phase 3)
export type {
  ParsedCollectionQuery,
  ParsedDbCommand,
  ParsedQuery,
  DbCommandSignature,
  ParseError,
  Result,
} from '../../shared/queries.js';

export {
  DB_COMMAND_SIGNATURES,
  detectQueryType,
  parseDbCommand,
  parseCollectionQuery,
  parseQuery,
} from '../../shared/queries.js';

// Import parser types for use in executor code
import type {
  ParsedCollectionQuery,
  ParsedDbCommand,
  ParsedQuery,
  Result,
} from '../../shared/queries.js';

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
        const filter = (query.filter ?? {}) as Document;
        const findOptions = {
          projection: query.projection as Document | undefined,
          sort: query.sort as Document | undefined,
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
        const indexName = await collection.createIndex(
          (query.indexSpec ?? {}) as Document,
          (query.options ?? {}) as Document
        );
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
