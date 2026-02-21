// Typed API client wrapper — Tauri IPC for connections/databases, fetch for the rest

import { invoke } from '@tauri-apps/api/core';
import type {
  ConnectionResponse,
  CreateConnectionRequest,
  UpdateConnectionRequest,
  TestConnectionRequest,
  TestConnectionResponse,
  ConnectRequest,
  DatabaseInfo,
  CollectionInfo,
  CollectionSchemaResponse,
  ExecuteQueryRequest,
  ExecuteQueryResponse,
  ExportCsvRequest,
  UpdateFieldRequest,
  UpdateFieldResponse,
  DeleteDocumentRequest,
  DeleteDocumentResponse,
  ErrorResponse,
} from '../../../shared/contracts';

const API_BASE = '/api';

/**
 * Custom API error with typed properties
 */
export class ApiError extends Error {
  public isConnected?: boolean;

  constructor(
    public statusCode: number,
    public errorType: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Wrap a Tauri invoke error into an ApiError
 */
function wrapInvokeError(error: unknown): ApiError {
  if (typeof error === 'string') {
    return new ApiError(500, 'InvokeError', error);
  }
  if (error instanceof Error) {
    return new ApiError(500, 'InvokeError', error.message);
  }
  return new ApiError(500, 'InvokeError', String(error));
}

/**
 * Parse an error response from the API into an ApiError
 */
async function parseApiError(response: Response): Promise<ApiError> {
  let errorData: ErrorResponse;
  try {
    errorData = await response.json();
  } catch {
    return new ApiError(response.status, 'UnknownError', response.statusText);
  }
  const apiError = new ApiError(
    errorData.statusCode,
    errorData.error,
    errorData.message,
    errorData.details
  );
  // Propagate backend disconnection signal
  if ('isConnected' in errorData && errorData.isConnected === false) {
    apiError.isConnected = false;
  }
  return apiError;
}

/**
 * Transform a fetch response error into an ApiError
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await parseApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

/**
 * Make a typed fetch request (for endpoints not yet ported to Tauri)
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...options.headers } as Record<string, string>;

  // Only set Content-Type for requests with a body
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  return handleResponse<T>(response);
}

/**
 * Cancellable query error
 */
export class QueryCancelledError extends Error {
  constructor() {
    super('Query was cancelled');
    this.name = 'QueryCancelledError';
  }
}

// Version endpoint (Tauri)

export async function getVersion(): Promise<{
  version: string;
  update?: { version: string; url: string };
}> {
  try {
    const version = await invoke<string>('get_version');
    return { version };
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

// Connection endpoints (Tauri)

export async function getConnections(): Promise<ConnectionResponse[]> {
  try {
    return await invoke<ConnectionResponse[]>('list_connections');
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

export async function getConnection(id: string): Promise<ConnectionResponse> {
  try {
    return await invoke<ConnectionResponse>('get_connection', { id });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

export async function createConnection(data: CreateConnectionRequest): Promise<ConnectionResponse> {
  try {
    return await invoke<ConnectionResponse>('create_connection', { request: data });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

export async function updateConnection(
  id: string,
  data: UpdateConnectionRequest
): Promise<ConnectionResponse> {
  try {
    return await invoke<ConnectionResponse>('update_connection', { id, request: data });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

export async function deleteConnection(id: string): Promise<void> {
  try {
    await invoke<void>('delete_connection', { id });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

export async function testConnection(data: TestConnectionRequest): Promise<TestConnectionResponse> {
  try {
    return await invoke<TestConnectionResponse>('test_connection', { request: data });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

export async function testSavedConnection(
  id: string,
  password?: string
): Promise<TestConnectionResponse> {
  try {
    return await invoke<TestConnectionResponse>('test_saved_connection', { id, password });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

export async function connectToConnection(
  id: string,
  data?: ConnectRequest
): Promise<ConnectionResponse> {
  try {
    return await invoke<ConnectionResponse>('connect_to_connection', { id, request: data });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

export async function disconnectFromConnection(id: string): Promise<ConnectionResponse> {
  try {
    return await invoke<ConnectionResponse>('disconnect_from_connection', { id });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

// Database endpoints (Tauri)

export async function getDatabases(connectionId: string): Promise<DatabaseInfo[]> {
  try {
    return await invoke<DatabaseInfo[]>('get_databases', { id: connectionId });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

export async function getCollections(
  connectionId: string,
  database: string
): Promise<CollectionInfo[]> {
  try {
    return await invoke<CollectionInfo[]>('get_collections', { id: connectionId, database });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

// Schema endpoints (Tauri)

export async function getCollectionSchema(
  connectionId: string,
  database: string,
  collection: string
): Promise<CollectionSchemaResponse> {
  try {
    return await invoke<CollectionSchemaResponse>('get_schema', {
      id: connectionId,
      database,
      collection,
    });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

// Query endpoints (Tauri)

import { parseQuery } from '../../../shared/queries.js';

export interface ExecuteQueryOptions {
  tabId?: string;
}

export async function executeQuery(
  connectionId: string,
  data: ExecuteQueryRequest,
  options?: ExecuteQueryOptions
): Promise<ExecuteQueryResponse> {
  // Parse the query on the frontend before sending to Rust
  const parsed = parseQuery(data.query);
  if (!parsed.ok) {
    throw new ApiError(400, 'QueryParseError', parsed.error.message);
  }

  try {
    return await invoke<ExecuteQueryResponse>('execute_query', {
      id: connectionId,
      request: {
        query: parsed.value,
        database: data.database,
        page: data.page ?? 1,
        pageSize: data.pageSize ?? 50,
        tabId: options?.tabId,
      },
    });
  } catch (error) {
    if (typeof error === 'string' && error.includes('cancelled')) {
      throw new QueryCancelledError();
    }
    throw wrapInvokeError(error);
  }
}

export async function cancelQuery(tabId: string): Promise<void> {
  try {
    await invoke<void>('cancel_query', { tabId });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

// Export endpoints (fetch — Phase 4)

export async function exportCsv(
  connectionId: string,
  data: ExportCsvRequest,
  options?: { signal?: AbortSignal }
): Promise<Response> {
  const response = await fetch(`${API_BASE}/connections/${connectionId}/export-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: options?.signal,
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return response;
}

// Document endpoints (Tauri)

export async function updateField(
  connectionId: string,
  data: UpdateFieldRequest
): Promise<UpdateFieldResponse> {
  try {
    return await invoke<UpdateFieldResponse>('update_field', { id: connectionId, request: data });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

export async function deleteDocument(
  connectionId: string,
  data: DeleteDocumentRequest
): Promise<DeleteDocumentResponse> {
  try {
    return await invoke<DeleteDocumentResponse>('delete_document', {
      id: connectionId,
      request: data,
    });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

// File endpoints (fetch — Phase 5)

export interface FileReadResponse {
  content: string;
  path: string;
}

export interface FileWriteRequest {
  path: string;
  content: string;
}

export interface FileWriteResponse {
  success: boolean;
  path: string;
}

export async function readFile(path: string): Promise<FileReadResponse> {
  return request<FileReadResponse>(`/files/read?path=${encodeURIComponent(path)}`);
}

export async function writeFile(data: FileWriteRequest): Promise<FileWriteResponse> {
  return request<FileWriteResponse>('/files/write', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
