// API contracts - Single source of truth for types used by both frontend and backend

// Connection Management
export interface CreateConnectionRequest {
  name: string;
  uri: string; // full URI (may contain credentials — backend strips them)
  savePassword?: boolean; // default true — when false, password is not stored in keyring
}

export interface UpdateConnectionRequest {
  name?: string;
  uri?: string; // full URI (may contain credentials — backend strips them)
  savePassword?: boolean;
}

export interface ConnectionResponse {
  id: string;
  name: string;
  uri: string; // credential-stripped URI
  username?: string;
  savePassword: boolean;
  isConnected: boolean;
  createdAt: string;
  updatedAt: string;
  error?: string; // set when connection uses old format
}

export interface ConnectRequest {
  password?: string; // supplied at runtime when savePassword=false
  savePassword?: boolean; // if true + password provided, persist to keyring ("Remember" flow)
}

export interface TestConnectionRequest {
  uri: string; // full URI (may contain credentials)
  operationId?: string; // optional request id for cancellation
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
  latencyMs?: number;
}

// Database and Collections
export interface DatabaseInfo {
  name: string;
  sizeOnDisk: number;
  empty: boolean;
}

export interface ServerInfoSection {
  data?: Record<string, unknown>;
  error?: string;
}

export interface ServerInfoResponse {
  build: ServerInfoSection;
  runtime: ServerInfoSection;
  topology: ServerInfoSection;
}

export interface CollectionInfo {
  name: string;
  type: 'collection' | 'view';
  documentCount: number;
  avgDocumentSize: number;
  totalSize: number;
}

// Indexes
export interface IndexInfo {
  name: string;
  key: Record<string, unknown>;
  unique: boolean;
  sparse: boolean;
  expireAfterSeconds?: number | null;
}

// Query Execution
export interface ExecuteQueryRequest {
  query: string;
  database: string;
  page?: number;
  pageSize?: 50 | 100 | 250 | 500;
}

export interface ExecuteQueryResponse {
  documents: Record<string, unknown>[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  executionTimeMs: number;
}

// Shell scripts (run through mongosh)
export interface ExecuteShellRequest {
  /** Already instrumented: calls `__dgrid.result(index, value)` for each value to report. */
  script: string;
  database: string;
  /** For cancellation with `cancel_query`. */
  tabId?: string;
}

export interface ShellResult {
  /** The index passed to `__dgrid.result`. */
  index: number;
  kind: 'cursor' | 'value';
  /** Tagged format, as in `ExecuteQueryResponse.documents`. */
  documents: Record<string, unknown>[];
  truncated: boolean;
}

export interface ShellError {
  message: string;
}

export interface ExecuteShellResponse {
  results: ShellResult[];
  /** stdout and stderr, merged in arrival order. */
  output: string;
  /** Set when mongosh exits non-zero. */
  error?: ShellError;
  executionTimeMs: number;
}

// CSV Export
export interface ExportCsvRequest {
  query: string;
  database: string;
}

export interface ExportCsvStringResponse {
  csv: string;
  exportedCount: number;
  truncated: boolean;
}

// Document Field Updates
export interface UpdateFieldRequest {
  database: string;
  collection: string;
  documentId: unknown;
  fieldPath: string;
  value: unknown;
  type: string;
}

export interface UpdateFieldResponse {
  success: boolean;
  modifiedCount: number;
}

// Full Document Update (replace)
export interface UpdateDocumentRequest {
  database: string;
  collection: string;
  documentId: unknown;
  document: unknown;
}

export interface UpdateDocumentResponse {
  success: boolean;
  modifiedCount: number;
}

// Document Insertion
export interface InsertDocumentRequest {
  database: string;
  collection: string;
  document: unknown;
}

export interface InsertDocumentResponse {
  success: boolean;
  insertedId: unknown;
}

// Document Deletion
export interface DeleteDocumentRequest {
  database: string;
  collection: string;
  documentId: unknown;
}

export interface DeleteDocumentResponse {
  success: boolean;
  deletedCount: number;
}

// Schema Sampling
export interface CollectionSchemaResponse {
  fields: string[];
  sampleSize: number;
}

// Version / Update Check
export interface VersionResponse {
  version: string;
  installMethod: string;
  update?: { version: string; url: string };
}

// Error Response
export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}
