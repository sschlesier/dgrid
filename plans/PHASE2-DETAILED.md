# Phase 2: Core Backend - Detailed Implementation Plan

## Overview

**Goal**: Implement MongoDB operations, connection management, and API routes
**Prerequisites**: Phase 1 complete (project scaffolding, Fastify app, basic config)
**Verification**: Integration tests with mongodb-memory-server

---

## Task 2.1: MongoDB Connection Manager

**Files**: `src/backend/db/mongodb.ts`, `src/backend/__tests__/mongodb.test.ts`

**Implementation**:

```typescript
// Core exports needed:
export interface MongoConnectionOptions {
  uri: string;
  database?: string;
}

export interface ConnectionPool {
  connect(id: string, options: MongoConnectionOptions): Promise<void>;
  disconnect(id: string): Promise<void>;
  getClient(id: string): MongoClient | undefined;
  getDb(id: string, dbName?: string): Db | undefined;
  isConnected(id: string): boolean;
  listConnections(): string[];
}

export function createConnectionPool(): ConnectionPool;
```

**Acceptance Criteria**:

- [ ] Pool manages multiple named connections
- [ ] Graceful connection/disconnection
- [ ] Connection state tracking
- [ ] Proper error handling for connection failures
- [ ] Tests with mongodb-memory-server

---

## Task 2.2: Query Parser

**Files**: `src/backend/db/queries.ts`, `src/backend/__tests__/queries.test.ts`

**Implementation**:

```typescript
// Parse MongoDB shell-style queries
export interface ParsedQuery {
  collection: string;
  operation: 'find' | 'aggregate' | 'count' | 'distinct';
  filter?: Document;
  projection?: Document;
  sort?: Document;
  limit?: number;
  skip?: number;
  pipeline?: Document[]; // For aggregate
}

export function parseQuery(queryText: string): Result<ParsedQuery, ParseError>;
```

**Supported Query Formats**:

```javascript
// find queries
db.users.find({});
db.users.find({ age: { $gt: 21 } });
db.users.find({}, { name: 1, email: 1 });
db.users.find({}).sort({ created: -1 }).limit(10);

// aggregate
db.orders.aggregate([{ $match: {} }, { $group: {} }]);

// count/distinct
db.users.count({ active: true });
db.users.distinct('role');
```

**Acceptance Criteria**:

- [ ] Parses basic find queries with filter/projection
- [ ] Parses chained methods (sort, limit, skip)
- [ ] Parses aggregate pipelines
- [ ] Returns structured ParseError for invalid syntax
- [ ] Unit tests for each query type

---

## Task 2.3: Query Executor

**Files**: `src/backend/db/queries.ts` (extend), `src/backend/__tests__/queries.test.ts` (extend)

**Implementation**:

```typescript
export interface QueryResult {
  documents: Document[];
  totalCount: number;
  executionTimeMs: number;
  hasMore: boolean;
}

export interface QueryOptions {
  page?: number;
  pageSize?: number; // 50, 100, 250, 500
}

export async function executeQuery(
  db: Db,
  query: ParsedQuery,
  options?: QueryOptions
): Promise<Result<QueryResult, QueryError>>;
```

**Acceptance Criteria**:

- [ ] Executes parsed queries against MongoDB
- [ ] Implements pagination (default 50 per page)
- [ ] Returns total count for pagination UI
- [ ] Tracks execution time
- [ ] Handles query timeout (30s default)
- [ ] Integration tests with mongodb-memory-server

---

## Task 2.4: BSON Serialization

**Files**: `src/backend/db/bson.ts`, `src/backend/__tests__/bson.test.ts`

**Implementation**:

```typescript
// Serialize BSON types to JSON-safe format with type info
export interface SerializedValue {
  _type: 'ObjectId' | 'Date' | 'Binary' | 'Decimal128' | 'Long' | 'UUID';
  _value: string;
}

export function serializeDocument(doc: Document): Record<string, unknown>;
export function deserializeDocument(doc: Record<string, unknown>): Document;
```

**Type Mappings**:

| BSON Type  | Serialized Format                              |
| ---------- | ---------------------------------------------- |
| ObjectId   | `{ _type: 'ObjectId', _value: '507f1f77...' }` |
| Date       | `{ _type: 'Date', _value: '2026-01-23T...' }`  |
| Binary     | `{ _type: 'Binary', _value: 'base64...' }`     |
| Decimal128 | `{ _type: 'Decimal128', _value: '123.456' }`   |
| Regular    | Pass through unchanged                         |

**Acceptance Criteria**:

- [ ] Serializes all common BSON types
- [ ] Round-trip: deserialize(serialize(doc)) equals original
- [ ] Handles nested documents and arrays
- [ ] Unit tests for each BSON type

---

## Task 2.5: Connection Storage

**Files**: `src/backend/storage/connections.ts`, `src/backend/__tests__/connections.test.ts`

**Implementation**:

```typescript
export interface StoredConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  database?: string;
  username?: string;
  authSource?: string;
  // Note: password stored separately in keyring
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionStorage {
  list(): Promise<StoredConnection[]>;
  get(id: string): Promise<StoredConnection | undefined>;
  create(conn: Omit<StoredConnection, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredConnection>;
  update(id: string, updates: Partial<StoredConnection>): Promise<StoredConnection>;
  delete(id: string): Promise<void>;
}

export function createConnectionStorage(dataDir: string): ConnectionStorage;
```

**Storage Format**: JSON file at `{dataDir}/connections.json`

**Acceptance Criteria**:

- [ ] CRUD operations for connections
- [ ] Atomic file writes (write to temp, rename)
- [ ] Auto-create data directory if missing
- [ ] Generate UUID for new connections
- [ ] Unit tests (mock filesystem)

---

## Task 2.6: Keyring Integration

**Files**: `src/backend/storage/keyring.ts`, `src/backend/__tests__/keyring.test.ts`

**Implementation**:

```typescript
// Using @napi-rs/keyring for OS credential storage
export interface PasswordStorage {
  get(connectionId: string): Promise<string | undefined>;
  set(connectionId: string, password: string): Promise<void>;
  delete(connectionId: string): Promise<void>;
}

export function createPasswordStorage(serviceName: string): PasswordStorage;
```

**Service Name**: `dgrid-mongodb-gui`

**Acceptance Criteria**:

- [ ] Store/retrieve passwords using OS keyring
- [ ] Handle keyring unavailable gracefully
- [ ] Delete password when connection deleted
- [ ] Unit tests with mock (real keyring in integration)

---

## Task 2.7: Connections API Routes

**Files**: `src/backend/routes/connections.ts`, `src/backend/__tests__/routes/connections.test.ts`

**Endpoints**:

```
GET    /api/connections             - List all connections
POST   /api/connections             - Create connection
GET    /api/connections/:id         - Get connection details
PUT    /api/connections/:id         - Update connection
DELETE /api/connections/:id         - Delete connection
POST   /api/connections/:id/test    - Test connection
POST   /api/connections/:id/connect - Establish connection
POST   /api/connections/:id/disconnect - Close connection
```

**Request/Response Contracts** (add to `src/shared/contracts.ts`):

```typescript
export interface CreateConnectionRequest {
  name: string;
  host: string;
  port: number;
  database?: string;
  username?: string;
  password?: string; // Stored in keyring, not returned
  authSource?: string;
}

export interface ConnectionResponse {
  id: string;
  name: string;
  host: string;
  port: number;
  database?: string;
  username?: string;
  authSource?: string;
  isConnected: boolean;
  createdAt: string;
  updatedAt: string;
}
```

**Acceptance Criteria**:

- [ ] All CRUD endpoints implemented
- [ ] Input validation with Fastify schemas
- [ ] Password stored in keyring on create/update
- [ ] Test connection returns success/error
- [ ] Integration tests

---

## Task 2.8: Database/Collection Routes

**Files**: `src/backend/routes/databases.ts`, `src/backend/routes/collections.ts`

**Endpoints**:

```
GET /api/connections/:id/databases                      - List databases
GET /api/connections/:id/databases/:db/collections      - List collections
GET /api/connections/:id/databases/:db/collections/:coll/stats - Collection stats
```

**Response Contracts**:

```typescript
export interface DatabaseInfo {
  name: string;
  sizeOnDisk: number;
  empty: boolean;
}

export interface CollectionInfo {
  name: string;
  type: 'collection' | 'view';
  documentCount: number;
  avgDocumentSize: number;
  totalSize: number;
  indexes: number;
}
```

**Acceptance Criteria**:

- [ ] List databases for active connection
- [ ] List collections with stats
- [ ] Handle connection not active (400 error)
- [ ] Integration tests

---

## Task 2.9: Query Execution Route

**Files**: `src/backend/routes/query.ts`, `src/backend/__tests__/routes/query.test.ts`

**Endpoints**:

```
POST /api/connections/:id/query - Execute query
```

**Request/Response**:

```typescript
export interface ExecuteQueryRequest {
  query: string; // MongoDB shell syntax
  database: string;
  page?: number;
  pageSize?: 50 | 100 | 250 | 500;
}

export interface ExecuteQueryResponse {
  documents: Record<string, unknown>[]; // Serialized BSON
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  executionTimeMs: number;
}
```

**Acceptance Criteria**:

- [ ] Parse and execute query
- [ ] Return serialized BSON documents
- [ ] Pagination working correctly
- [ ] Query syntax errors return 400 with details
- [ ] Query timeout handled (408 or 504)
- [ ] Integration tests with various query types

---

## Task 2.10: File Operations Routes

**Files**: `src/backend/routes/files.ts`, `src/backend/storage/files.ts`

**Endpoints**:

```
POST /api/files/open-dialog     - Open file picker (returns path)
GET  /api/files/read?path=      - Read file contents
POST /api/files/write           - Write file contents
POST /api/files/watch           - Start watching file (WebSocket)
POST /api/files/unwatch         - Stop watching file
```

**Note**: File watching uses WebSocket for real-time updates when external editor modifies query files.

**Acceptance Criteria**:

- [ ] Read/write query files (.js, .mongodb)
- [ ] File watcher using chokidar
- [ ] WebSocket notifications on file change
- [ ] Security: validate file paths, prevent directory traversal
- [ ] Unit tests

---

## Task 2.11: Route Registration & Fastify Plugin

**Files**: `src/backend/routes/index.ts`, `src/backend/plugins/api.ts`

**Implementation**:

```typescript
// Register all API routes as Fastify plugin
export async function apiRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(connectionRoutes, { prefix: '/api/connections' });
  await fastify.register(databaseRoutes, { prefix: '/api' });
  await fastify.register(queryRoutes, { prefix: '/api' });
  await fastify.register(fileRoutes, { prefix: '/api/files' });
}
```

**Acceptance Criteria**:

- [ ] All routes registered under /api prefix
- [ ] Error handling plugin (transforms errors to standard format)
- [ ] Request logging
- [ ] Integration test hitting all endpoints

---

## Task 2.12: Integration Test Suite

**Files**: `src/backend/__tests__/integration.test.ts`

**Test Scenarios**:

1. Full connection lifecycle (create → connect → query → disconnect → delete)
2. Query execution with various query types
3. BSON serialization round-trip
4. Error handling (invalid connection, bad query syntax, timeout)
5. Concurrent connections

**Acceptance Criteria**:

- [ ] Uses mongodb-memory-server
- [ ] Covers happy path for all features
- [ ] Tests error scenarios
- [ ] Runs in CI without external dependencies

---

## Execution Order

```
2.1 MongoDB Connection Manager  ─┐
2.4 BSON Serialization          ─┼─► 2.3 Query Executor
2.2 Query Parser                ─┘
                                      │
2.5 Connection Storage ──┐            │
2.6 Keyring Integration ─┴─► 2.7 Connections API Routes
                                      │
                              2.8 Database/Collection Routes
                                      │
                              2.9 Query Execution Route
                                      │
2.10 File Operations Routes          │
                                      │
                              2.11 Route Registration
                                      │
                              2.12 Integration Test Suite
```

**Parallel Work Opportunities**:

- Tasks 2.1, 2.2, 2.4 can run in parallel
- Tasks 2.5, 2.6 can run in parallel
- Task 2.10 is independent, can run anytime

---

## Verification Checklist (End of Phase 2)

- [ ] `pnpm test` - All tests passing
- [ ] `pnpm type-check` - No TypeScript errors
- [ ] `pnpm lint` - No linting errors
- [ ] `pnpm build` - Builds successfully
- [ ] Manual test: Connect to local MongoDB, execute query, see results
- [ ] No `console.log` statements (use Pino logger)
- [ ] All API contracts defined in `src/shared/contracts.ts`
