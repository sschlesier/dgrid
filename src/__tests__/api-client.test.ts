import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ApiError,
  ConnectCancelledError,
  QueryCancelledError,
  getConnections,
  getConnection,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,
  testSavedConnection,
  connectToConnection,
  cancelConnectToConnection,
  disconnectFromConnection,
  getDatabases,
  getCollections,
  getCollectionSchema,
  getVersion,
  checkForUpdates,
  executeQuery,
  cancelQuery,
  updateField,
  deleteDocument,
  readFile,
  writeFile,
} from '../api/client';

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe('API client', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
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

  describe('documents (Tauri)', () => {
    it('updateField invokes update_field', async () => {
      const updateResult = { success: true, modifiedCount: 1 };
      mockInvoke.mockResolvedValueOnce(updateResult);

      const data = {
        database: 'testdb',
        collection: 'users',
        documentId: { _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' },
        fieldPath: 'name',
        value: 'Alice',
        type: 'string',
      };
      const result = await updateField('conn1', data);

      expect(mockInvoke).toHaveBeenCalledWith('update_field', {
        id: 'conn1',
        request: data,
      });
      expect(result).toEqual(updateResult);
    });

    it('deleteDocument invokes delete_document', async () => {
      const deleteResult = { success: true, deletedCount: 1 };
      mockInvoke.mockResolvedValueOnce(deleteResult);

      const data = {
        database: 'testdb',
        collection: 'users',
        documentId: { _type: 'ObjectId', _value: '507f1f77bcf86cd799439011' },
      };
      const result = await deleteDocument('conn1', data);

      expect(mockInvoke).toHaveBeenCalledWith('delete_document', {
        id: 'conn1',
        request: data,
      });
      expect(result).toEqual(deleteResult);
    });

    it('updateField wraps invoke errors', async () => {
      mockInvoke.mockRejectedValueOnce('Database error');

      await expect(
        updateField('conn1', {
          database: 'testdb',
          collection: 'users',
          documentId: 1,
          fieldPath: 'name',
          value: 'Alice',
          type: 'string',
        })
      ).rejects.toThrow(ApiError);
    });

    it('deleteDocument wraps invoke errors', async () => {
      mockInvoke.mockRejectedValueOnce('Database error');

      await expect(
        deleteDocument('conn1', {
          database: 'testdb',
          collection: 'users',
          documentId: 1,
        })
      ).rejects.toThrow(ApiError);
    });
  });

  describe('version (Tauri)', () => {
    it('getVersion returns version string', async () => {
      mockInvoke.mockResolvedValueOnce('1.0.0');

      const result = await getVersion();

      expect(mockInvoke).toHaveBeenCalledWith('get_version');
      expect(result).toEqual({ version: '1.0.0' });
    });

    it('checkForUpdates returns version without update', async () => {
      mockInvoke.mockResolvedValueOnce({ version: '1.0.0' });

      const result = await checkForUpdates();

      expect(mockInvoke).toHaveBeenCalledWith('check_for_updates');
      expect(result).toEqual({ version: '1.0.0' });
    });

    it('checkForUpdates returns version with update info', async () => {
      mockInvoke.mockResolvedValueOnce({
        version: '1.0.0',
        update: { version: '1.1.0', url: 'https://example.com/release' },
      });

      const result = await checkForUpdates();

      expect(mockInvoke).toHaveBeenCalledWith('check_for_updates');
      expect(result).toEqual({
        version: '1.0.0',
        update: { version: '1.1.0', url: 'https://example.com/release' },
      });
    });

    it('checkForUpdates wraps invoke errors', async () => {
      mockInvoke.mockRejectedValueOnce('Network error');

      await expect(checkForUpdates()).rejects.toThrow(ApiError);
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

    it('connectToConnection throws ConnectCancelledError on cancellation', async () => {
      mockInvoke.mockRejectedValueOnce('Connection was cancelled');

      await expect(connectToConnection('1')).rejects.toThrow(ConnectCancelledError);
    });

    it('cancelConnectToConnection invokes cancel_connect_to_connection', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await cancelConnectToConnection('1');

      expect(mockInvoke).toHaveBeenCalledWith('cancel_connect_to_connection', { id: '1' });
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

  describe('files (Tauri)', () => {
    it('readFile invokes read_file', async () => {
      const fileData = { content: 'file content', path: '/test.js', name: 'test.js' };
      mockInvoke.mockResolvedValueOnce(fileData);

      const result = await readFile('/test.js');

      expect(mockInvoke).toHaveBeenCalledWith('read_file', { path: '/test.js' });
      expect(result).toEqual(fileData);
    });

    it('writeFile invokes write_file', async () => {
      const writeData = { path: '/test.js', content: 'new content' };
      const writeResult = { success: true, path: '/test.js' };
      mockInvoke.mockResolvedValueOnce(writeResult);

      const result = await writeFile(writeData);

      expect(mockInvoke).toHaveBeenCalledWith('write_file', { request: writeData });
      expect(result).toEqual(writeResult);
    });

    it('readFile wraps invoke errors', async () => {
      mockInvoke.mockRejectedValueOnce('File not found');

      await expect(readFile('/test.js')).rejects.toThrow(ApiError);
    });

    it('writeFile wraps invoke errors', async () => {
      mockInvoke.mockRejectedValueOnce('Permission denied');

      await expect(writeFile({ path: '/test.js', content: 'x' })).rejects.toThrow(ApiError);
    });
  });
});
