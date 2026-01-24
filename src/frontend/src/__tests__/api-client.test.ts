import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ApiError,
  getConnections,
  getConnection,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,
  connectToConnection,
  disconnectFromConnection,
  getDatabases,
  getCollections,
  executeQuery,
  readFile,
  writeFile,
} from '../api/client';

describe('API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  function mockResponse(data: unknown, status = 200) {
    mockFetch.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(data),
    });
  }

  describe('error handling', () => {
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
        await getConnections();
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

      await expect(getConnections()).rejects.toThrow(ApiError);
    });

    it('handles non-JSON error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await expect(getConnections()).rejects.toThrow('Internal Server Error');
    });
  });

  describe('connections', () => {
    it('getConnections fetches all connections', async () => {
      const connections = [
        { id: '1', name: 'Test', host: 'localhost', port: 27017, isConnected: false },
      ];
      mockResponse(connections);

      const result = await getConnections();

      expect(mockFetch).toHaveBeenCalledWith('/api/connections', expect.any(Object));
      expect(result).toEqual(connections);
    });

    it('getConnection fetches single connection', async () => {
      const connection = { id: '1', name: 'Test', host: 'localhost', port: 27017 };
      mockResponse(connection);

      const result = await getConnection('1');

      expect(mockFetch).toHaveBeenCalledWith('/api/connections/1', expect.any(Object));
      expect(result).toEqual(connection);
    });

    it('createConnection sends POST request', async () => {
      const newConnection = { name: 'New', host: 'localhost', port: 27017 };
      const created = { id: '1', ...newConnection, isConnected: false };
      mockResponse(created);

      const result = await createConnection(newConnection);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/connections',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(newConnection),
        })
      );
      expect(result).toEqual(created);
    });

    it('updateConnection sends PUT request', async () => {
      const updates = { name: 'Updated' };
      const updated = { id: '1', name: 'Updated', host: 'localhost', port: 27017 };
      mockResponse(updated);

      const result = await updateConnection('1', updates);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/connections/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updates),
        })
      );
      expect(result).toEqual(updated);
    });

    it('deleteConnection sends DELETE request', async () => {
      mockResponse(undefined);

      await deleteConnection('1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/connections/1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('testConnection sends POST request', async () => {
      const testData = { host: 'localhost', port: 27017 };
      const testResult = { success: true, message: 'Connected', latencyMs: 10 };
      mockResponse(testResult);

      const result = await testConnection(testData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/connections/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(testData),
        })
      );
      expect(result).toEqual(testResult);
    });

    it('connectToConnection sends POST request', async () => {
      const connected = { id: '1', name: 'Test', isConnected: true };
      mockResponse(connected);

      const result = await connectToConnection('1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/connections/1/connect',
        expect.objectContaining({ method: 'POST' })
      );
      expect(result).toEqual(connected);
    });

    it('disconnectFromConnection sends POST request', async () => {
      const disconnected = { id: '1', name: 'Test', isConnected: false };
      mockResponse(disconnected);

      const result = await disconnectFromConnection('1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/connections/1/disconnect',
        expect.objectContaining({ method: 'POST' })
      );
      expect(result).toEqual(disconnected);
    });

    it('does not set Content-Type header for requests without body', async () => {
      // Regression test: Fastify rejects empty body with Content-Type: application/json
      const disconnected = { id: '1', name: 'Test', isConnected: false };
      mockResponse(disconnected);

      await disconnectFromConnection('1');

      const fetchCall = mockFetch.mock.calls[0];
      const headers = fetchCall[1].headers;
      expect(headers['Content-Type']).toBeUndefined();
    });

    it('sets Content-Type header for requests with body', async () => {
      const newConnection = { name: 'New', host: 'localhost', port: 27017 };
      mockResponse({ id: '1', ...newConnection });

      await createConnection(newConnection);

      const fetchCall = mockFetch.mock.calls[0];
      const headers = fetchCall[1].headers;
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('databases', () => {
    it('getDatabases fetches databases for connection', async () => {
      const databases = [{ name: 'test', sizeOnDisk: 1024, empty: false }];
      mockResponse(databases);

      const result = await getDatabases('1');

      expect(mockFetch).toHaveBeenCalledWith('/api/connections/1/databases', expect.any(Object));
      expect(result).toEqual(databases);
    });

    it('getCollections fetches collections for database', async () => {
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
      mockResponse(collections);

      const result = await getCollections('1', 'testdb');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/connections/1/databases/testdb/collections',
        expect.any(Object)
      );
      expect(result).toEqual(collections);
    });
  });

  describe('query', () => {
    it('executeQuery sends POST request with query', async () => {
      const queryData = { query: 'db.users.find({})', database: 'test' };
      const queryResult = {
        documents: [{ _id: '1', name: 'Alice' }],
        totalCount: 1,
        page: 1,
        pageSize: 50,
        hasMore: false,
        executionTimeMs: 5,
      };
      mockResponse(queryResult);

      const result = await executeQuery('1', queryData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/connections/1/query',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(queryData),
        })
      );
      expect(result).toEqual(queryResult);
    });
  });

  describe('files', () => {
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
