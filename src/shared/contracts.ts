// API contracts - Single source of truth for types used by both frontend and backend

// Connection Management
export interface CreateConnectionRequest {
  name: string;
  host: string;
  port: number;
  database?: string;
  username?: string;
  password?: string;
  authSource?: string;
}

export interface UpdateConnectionRequest {
  name?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
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

export interface TestConnectionRequest {
  host: string;
  port: number;
  database?: string;
  username?: string;
  password?: string;
  authSource?: string;
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

// Error Response
export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}
