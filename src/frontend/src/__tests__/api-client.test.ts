import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ApiError,
  QueryCancelledError,
  getConnections,
  getConnection,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,
  testSavedConnection,
  connectToConnection,
  disconnectFromConnection,
  getDatabases,
  getCollections,
  getCollectionSchema,
  getVersion,
  executeQuery,
  cancelQuery,
  exportCsv,
  readFile,
  writeFile,
} from '../api/client';

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe('API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    mockInvoke.mockReset();
  });

  function mockResponse(data: unknown, status = 200) {
    mockFetch.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(data),
    });
  }

  describe('error handling (fetch-based)', () => {
    it('throws ApiError on 4xx response with details', async () => {
      mockResponse(
        {
          error: 'ValidationError',
          message: 'Invalid input',
          statusCode: 400,
          details: { field: 'name' },
        },
        400
      );

      try {
        await readFile('/test.js');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
        expect((error as ApiError).errorType).toBe('ValidationError');
        expect((error as ApiError).message).toBe('Invalid input');
        expect((error as ApiError).details).toEqual({ field: 'name' });
      }
    });

    it('throws ApiError on 5xx response', async () => {
      mockResponse(
        {
          error: 'InternalError',
          message: 'Server error',
          statusCode: 500,
        },
        500
      );

      await expect(readFile('/test.js')).rejects.toThrow(ApiError);
    });

    it('handles non-JSON error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await expect(readFile('/test.js')).rejects.toThrow('Internal Server Error');
    });

    it('propagates isConnected: false from error response', async () => {
      mockResponse(
        {
          error: 'DatabaseError',
          message: 'Connection lost',
          statusCode: 500,
          isConnected: false,
        },
        500
      );

      try {
        await readFile('/test.js');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).isConnected).toBe(false);
      }
    });

    it('does not set isConnected when not present in error response', async () => {
      mockResponse(
        {
          error: 'DatabaseError',
          message: 'Generic error',
          statusCode: 500,
        },
        500
      );

      try {
        await readFile('/test.js');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).isConnected).toBeUndefined();
      }
    });
  });

  describe('error handling (Tauri invoke)', () => {
    it('wraps string errors into ApiError', async () => {
      mockInvoke.mockRejectedValueOnce('Connection refused');

      try {
        await getConnections();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
        expect((error as ApiError).errorType).toBe('InvokeError');
        expect((error as ApiError).message).toBe('Connection refused');
      }
    });

    it('wraps Error objects into ApiError', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Something went wrong'));

      try {
        await getConnections();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toBe('Something went wrong');
      }
    });
  });

  describe('exportCsv error handling', () => {
    it('throws ApiError on export failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Error',
        json: () =>
          Promise.resolve({
            error: 'ExportError',
            message: 'Export failed',
            statusCode: 500,
          }),
      });

      await expect(
        exportCsv('1', { query: 'db.users.find({})', database: 'test' })
      ).rejects.toThrow(ApiError);
    });

    it('propagates isConnected: false from export error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Error',
        json: () =>
          Promise.resolve({
            error: 'ExportError',
            message: 'Connection lost',
            statusCode: 500,
            isConnected: false,
          }),
      });

      try {
        await exportCsv('1', { query: 'db.users.find({})', database: 'test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).isConnected).toBe(false);
      }
    });

    it('handles non-JSON export error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await expect(
        exportCsv('1', { query: 'db.users.find({})', database: 'test' })
      ).rejects.toThrow('Internal Server Error');
    });
  });

  describe('version (Tauri)', () => {
    it('getVersion returns version string', async () => {
      mockInvoke.mockResolvedValueOnce('1.0.0');

      const result = await getVersion();

      expect(mockInvoke).toHaveBeenCalledWith('get_version');
      expect(result).toEqual({ version: '1.0.0' });
    });
  });

  describe('connections (Tauri)', () => {
    it('getConnections invokes list_connections', async () => {
      const connections = [
        { id: '1', name: 'Test', host: 'localhost', port: 27017, isConnected: false },
      ];
      mockInvoke.mockResolvedValueOnce(connections);

      const result = await getConnections();

      expect(mockInvoke).toHaveBeenCalledWith('list_connections');
      expect(result).toEqual(connections);
    });

    it('getConnection invokes get_connection', async () => {
      const connection = { id: '1', name: 'Test', host: 'localhost', port: 27017 };
      mockInvoke.mockResolvedValueOnce(connection);

      const result = await getConnection('1');

      expect(mockInvoke).toHaveBeenCalledWith('get_connection', { id: '1' });
      expect(result).toEqual(connection);
    });

    it('createConnection invokes create_connection', async () => {
      const newConnection = { name: 'New', uri: 'mongodb://localhost:27017' };
      const created = { id: '1', ...newConnection, isConnected: false };
      mockInvoke.mockResolvedValueOnce(created);

      const result = await createConnection(newConnection);

      expect(mockInvoke).toHaveBeenCalledWith('create_connection', { request: newConnection });
      expect(result).toEqual(created);
    });

    it('updateConnection invokes update_connection', async () => {
      const updates = { name: 'Updated' };
      const updated = { id: '1', name: 'Updated', host: 'localhost', port: 27017 };
      mockInvoke.mockResolvedValueOnce(updated);

      const result = await updateConnection('1', updates);

      expect(mockInvoke).toHaveBeenCalledWith('update_connection', { id: '1', request: updates });
      expect(result).toEqual(updated);
    });

    it('deleteConnection invokes delete_connection', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await deleteConnection('1');

      expect(mockInvoke).toHaveBeenCalledWith('delete_connection', { id: '1' });
    });

    it('testConnection invokes test_connection', async () => {
      const testData = { uri: 'mongodb://localhost:27017' };
      const testResult = { success: true, message: 'Connected', latencyMs: 10 };
      mockInvoke.mockResolvedValueOnce(testResult);

      const result = await testConnection(testData);

      expect(mockInvoke).toHaveBeenCalledWith('test_connection', { request: testData });
      expect(result).toEqual(testResult);
    });

    it('testSavedConnection invokes test_saved_connection', async () => {
      const testResult = { success: true, message: 'Connected', latencyMs: 10 };
      mockInvoke.mockResolvedValueOnce(testResult);

      const result = await testSavedConnection('1', 'secret');

      expect(mockInvoke).toHaveBeenCalledWith('test_saved_connection', {
        id: '1',
        password: 'secret',
      });
      expect(result).toEqual(testResult);
    });

    it('connectToConnection invokes connect_to_connection', async () => {
      const connected = { id: '1', name: 'Test', isConnected: true };
      mockInvoke.mockResolvedValueOnce(connected);

      const result = await connectToConnection('1');

      expect(mockInvoke).toHaveBeenCalledWith('connect_to_connection', {
        id: '1',
        request: undefined,
      });
      expect(result).toEqual(connected);
    });

    it('disconnectFromConnection invokes disconnect_from_connection', async () => {
      const disconnected = { id: '1', name: 'Test', isConnected: false };
      mockInvoke.mockResolvedValueOnce(disconnected);

      const result = await disconnectFromConnection('1');

      expect(mockInvoke).toHaveBeenCalledWith('disconnect_from_connection', { id: '1' });
      expect(result).toEqual(disconnected);
    });
  });

  describe('databases (Tauri)', () => {
    it('getDatabases invokes get_databases', async () => {
      const databases = [{ name: 'test', sizeOnDisk: 1024, empty: false }];
      mockInvoke.mockResolvedValueOnce(databases);

      const result = await getDatabases('1');

      expect(mockInvoke).toHaveBeenCalledWith('get_databases', { id: '1' });
      expect(result).toEqual(databases);
    });

    it('getCollections invokes get_collections', async () => {
      const collections = [
        {
          name: 'users',
          type: 'collection',
          documentCount: 100,
          avgDocumentSize: 256,
          totalSize: 25600,
          indexes: 2,
        },
      ];
      mockInvoke.mockResolvedValueOnce(collections);

      const result = await getCollections('1', 'testdb');

      expect(mockInvoke).toHaveBeenCalledWith('get_collections', {
        id: '1',
        database: 'testdb',
      });
      expect(result).toEqual(collections);
    });

    it('getCollectionSchema invokes get_schema', async () => {
      const schema = { fields: [{ name: '_id', types: ['ObjectId'], count: 10 }] };
      mockInvoke.mockResolvedValueOnce(schema);

      const result = await getCollectionSchema('1', 'testdb', 'users');

      expect(mockInvoke).toHaveBeenCalledWith('get_schema', {
        id: '1',
        database: 'testdb',
        collection: 'users',
      });
      expect(result).toEqual(schema);
    });
  });

  describe('query (Tauri)', () => {
    it('executeQuery parses and invokes execute_query', async () => {
      const queryResult = {
        documents: [{ _id: '1', name: 'Alice' }],
        totalCount: 1,
        page: 1,
        pageSize: 50,
        hasMore: false,
        executionTimeMs: 5,
      };
      mockInvoke.mockResolvedValueOnce(queryResult);

      const result = await executeQuery('conn1', {
        query: 'db.users.find({})',
        database: 'test',
      });

      expect(mockInvoke).toHaveBeenCalledWith('execute_query', {
        id: 'conn1',
        request: expect.objectContaining({
          database: 'test',
          page: 1,
          pageSize: 50,
        }),
      });
      // Verify the query was parsed (sent as parsed object, not raw string)
      const invokeArgs = mockInvoke.mock.calls[0][1];
      expect(invokeArgs.request.query).toHaveProperty('type', 'collection');
      expect(result).toEqual(queryResult);
    });

    it('executeQuery throws ApiError on parse failure', async () => {
      try {
        await executeQuery('conn1', {
          query: 'invalid query syntax!!!',
          database: 'test',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
        expect((error as ApiError).errorType).toBe('QueryParseError');
      }
    });

    it('executeQuery throws QueryCancelledError on cancellation', async () => {
      mockInvoke.mockRejectedValueOnce('Query was cancelled');

      await expect(
        executeQuery('conn1', { query: 'db.users.find({})', database: 'test' })
      ).rejects.toThrow(QueryCancelledError);
    });

    it('executeQuery passes tabId in request', async () => {
      const queryResult = {
        documents: [],
        totalCount: 0,
        page: 1,
        pageSize: 50,
        hasMore: false,
        executionTimeMs: 1,
      };
      mockInvoke.mockResolvedValueOnce(queryResult);

      await executeQuery(
        'conn1',
        { query: 'db.users.find({})', database: 'test' },
        { tabId: 'tab-1' }
      );

      const invokeArgs = mockInvoke.mock.calls[0][1];
      expect(invokeArgs.request.tabId).toBe('tab-1');
    });

    it('cancelQuery invokes cancel_query', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await cancelQuery('tab-1');

      expect(mockInvoke).toHaveBeenCalledWith('cancel_query', { tabId: 'tab-1' });
    });
  });

  describe('files (fetch)', () => {
    it('readFile fetches file content', async () => {
      const fileData = { content: 'file content', path: '/test.js' };
      mockResponse(fileData);

      const result = await readFile('/test.js');

      expect(mockFetch).toHaveBeenCalledWith('/api/files/read?path=%2Ftest.js', expect.any(Object));
      expect(result).toEqual(fileData);
    });

    it('writeFile sends POST request', async () => {
      const writeData = { path: '/test.js', content: 'new content' };
      const writeResult = { success: true, path: '/test.js' };
      mockResponse(writeResult);

      const result = await writeFile(writeData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/files/write',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(writeData),
        })
      );
      expect(result).toEqual(writeResult);
    });
  });
});
