// API contracts - Single source of truth for types used by both frontend and backend

// Connection Management
export interface CreateConnectionRequest {
  name: string;
  uri: string; // full URI (may contain credentials — backend strips them)
}

export interface UpdateConnectionRequest {
  name?: string;
  uri?: string; // full URI (may contain credentials — backend strips them)
}

export interface ConnectionResponse {
  id: string;
  name: string;
  uri: string; // credential-stripped URI
  username?: string;
  isConnected: boolean;
  createdAt: string;
  updatedAt: string;
  error?: string; // set when connection uses old format
}

export interface TestConnectionRequest {
  uri: string; // full URI (may contain credentials)
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

export interface CollectionInfo {
  name: string;
  type: 'collection' | 'view';
  documentCount: number;
  avgDocumentSize: number;
  totalSize: number;
  indexes: number;
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
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  executionTimeMs: number;
}

// CSV Export
export interface ExportCsvRequest {
  query: string;
  database: string;
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

// Schema Sampling
export interface CollectionSchemaResponse {
  fields: string[];
  sampleSize: number;
}

// Error Response
export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}
