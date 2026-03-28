// Typed API client wrapper — all endpoints use Tauri IPC

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
  UpdateFieldRequest,
  UpdateFieldResponse,
  DeleteDocumentRequest,
  DeleteDocumentResponse,
  VersionResponse,
} from '../lib/contracts';

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
 * Cancellable query error
 */
export class QueryCancelledError extends Error {
  constructor() {
    super('Query was cancelled');
    this.name = 'QueryCancelledError';
  }
}

export class ConnectCancelledError extends Error {
  constructor() {
    super('Connection was cancelled');
    this.name = 'ConnectCancelledError';
  }
}

// Version endpoints (Tauri)

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

export async function checkForUpdates(): Promise<VersionResponse> {
  try {
    return await invoke<VersionResponse>('check_for_updates');
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
    if (typeof e === 'string' && e.includes('Connection was cancelled')) {
      throw new ConnectCancelledError();
    }
    throw wrapInvokeError(e);
  }
}

export async function cancelConnectToConnection(id: string): Promise<void> {
  try {
    await invoke<void>('cancel_connect_to_connection', { id });
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

export async function getCollectionsFast(
  connectionId: string,
  database: string
): Promise<CollectionInfo[]> {
  try {
    return await invoke<CollectionInfo[]>('get_collections_fast', { id: connectionId, database });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

export async function getAllCollectionStats(
  connectionId: string,
  database: string,
  collectionNames: string[]
): Promise<CollectionInfo[]> {
  try {
    return await invoke<CollectionInfo[]>('get_all_collection_stats', {
      id: connectionId,
      database,
      collectionNames,
    });
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

import { parseQuery } from '../lib/queries.js';

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

// File endpoints (Tauri)

export interface FileReadResponse {
  content: string;
  path: string;
  name: string;
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
  try {
    return await invoke<FileReadResponse>('read_file', { path });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}

export async function writeFile(data: FileWriteRequest): Promise<FileWriteResponse> {
  try {
    return await invoke<FileWriteResponse>('write_file', { request: data });
  } catch (e) {
    throw wrapInvokeError(e);
  }
}
