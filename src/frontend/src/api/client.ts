// Typed API client wrapper

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
  VersionResponse,
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
 * Make a typed fetch request
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

// Version endpoint

export async function getVersion(): Promise<VersionResponse> {
  return request<VersionResponse>('/version');
}

// Connection endpoints

export async function getConnections(): Promise<ConnectionResponse[]> {
  return request<ConnectionResponse[]>('/connections');
}

export async function getConnection(id: string): Promise<ConnectionResponse> {
  return request<ConnectionResponse>(`/connections/${id}`);
}

export async function createConnection(data: CreateConnectionRequest): Promise<ConnectionResponse> {
  return request<ConnectionResponse>('/connections', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateConnection(
  id: string,
  data: UpdateConnectionRequest
): Promise<ConnectionResponse> {
  return request<ConnectionResponse>(`/connections/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteConnection(id: string): Promise<void> {
  await request<void>(`/connections/${id}`, {
    method: 'DELETE',
  });
}

export async function testConnection(data: TestConnectionRequest): Promise<TestConnectionResponse> {
  return request<TestConnectionResponse>('/connections/test', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function testSavedConnection(id: string): Promise<TestConnectionResponse> {
  return request<TestConnectionResponse>(`/connections/${id}/test`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function connectToConnection(
  id: string,
  data?: ConnectRequest
): Promise<ConnectionResponse> {
  return request<ConnectionResponse>(`/connections/${id}/connect`, {
    method: 'POST',
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
}

export async function disconnectFromConnection(id: string): Promise<ConnectionResponse> {
  return request<ConnectionResponse>(`/connections/${id}/disconnect`, {
    method: 'POST',
  });
}

// Database endpoints

export async function getDatabases(connectionId: string): Promise<DatabaseInfo[]> {
  return request<DatabaseInfo[]>(`/connections/${connectionId}/databases`);
}

export async function getCollections(
  connectionId: string,
  database: string
): Promise<CollectionInfo[]> {
  return request<CollectionInfo[]>(
    `/connections/${connectionId}/databases/${database}/collections`
  );
}

// Schema endpoints

export async function getCollectionSchema(
  connectionId: string,
  database: string,
  collection: string
): Promise<CollectionSchemaResponse> {
  return request<CollectionSchemaResponse>(
    `/connections/${connectionId}/databases/${database}/collections/${collection}/schema`
  );
}

// Query endpoints

export interface ExecuteQueryOptions {
  signal?: AbortSignal;
}

export async function executeQuery(
  connectionId: string,
  data: ExecuteQueryRequest,
  options?: ExecuteQueryOptions
): Promise<ExecuteQueryResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(`${API_BASE}/connections/${connectionId}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      signal: options?.signal,
    });
    return handleResponse<ExecuteQueryResponse>(response);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new QueryCancelledError();
    }
    throw error;
  }
}

// Export endpoints

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

// Document endpoints

export async function updateField(
  connectionId: string,
  data: UpdateFieldRequest
): Promise<UpdateFieldResponse> {
  return request<UpdateFieldResponse>(`/connections/${connectionId}/documents/field`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteDocument(
  connectionId: string,
  data: DeleteDocumentRequest
): Promise<DeleteDocumentResponse> {
  return request<DeleteDocumentResponse>(`/connections/${connectionId}/documents`, {
    method: 'DELETE',
    body: JSON.stringify(data),
  });
}

// File endpoints

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
