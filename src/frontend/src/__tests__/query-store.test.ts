import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the API module before importing the store
vi.mock('../api/client', () => ({
  executeQuery: vi.fn(),
}));

// Import after mocking
import * as api from '../api/client';
import { queryStore } from '../stores/query.svelte';

const mockedApi = api as {
  executeQuery: ReturnType<typeof vi.fn>;
};

describe('queryStore', () => {
  beforeEach(() => {
    // Reset store state
    queryStore.queryTexts = new Map();
    queryStore.results = new Map();
    queryStore.isExecuting = new Map();
    queryStore.errors = new Map();
    queryStore.history = [];

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('query text', () => {
    it('getQueryText returns empty string for unknown tab', () => {
      expect(queryStore.getQueryText('unknown')).toBe('');
    });

    it('setQueryText stores text for tab', () => {
      queryStore.setQueryText('tab1', 'db.users.find()');

      expect(queryStore.getQueryText('tab1')).toBe('db.users.find()');
    });

    it('setQueryText updates existing text', () => {
      queryStore.setQueryText('tab1', 'old query');
      queryStore.setQueryText('tab1', 'new query');

      expect(queryStore.getQueryText('tab1')).toBe('new query');
    });

    it('manages multiple tabs independently', () => {
      queryStore.setQueryText('tab1', 'query 1');
      queryStore.setQueryText('tab2', 'query 2');

      expect(queryStore.getQueryText('tab1')).toBe('query 1');
      expect(queryStore.getQueryText('tab2')).toBe('query 2');
    });
  });

  describe('executeQuery', () => {
    it('executes query and stores results', async () => {
      const mockResult = {
        documents: [{ _id: '1', name: 'Alice' }],
        totalCount: 1,
        page: 1,
        pageSize: 50,
        hasMore: false,
        executionTimeMs: 5,
      };
      mockedApi.executeQuery.mockResolvedValue(mockResult);

      const result = await queryStore.executeQuery('tab1', 'conn1', 'testdb', 'db.users.find()');

      expect(result).toEqual(mockResult);
      expect(queryStore.getResults('tab1')).toEqual(mockResult);
      expect(queryStore.getError('tab1')).toBe(null);
      expect(queryStore.getIsExecuting('tab1')).toBe(false);
    });

    it('sets isExecuting during query', async () => {
      let executingDuringCall = false;

      mockedApi.executeQuery.mockImplementation(async () => {
        executingDuringCall = queryStore.getIsExecuting('tab1');
        return {
          documents: [],
          totalCount: 0,
          page: 1,
          pageSize: 50,
          hasMore: false,
          executionTimeMs: 1,
        };
      });

      await queryStore.executeQuery('tab1', 'conn1', 'db', 'query');

      expect(executingDuringCall).toBe(true);
      expect(queryStore.getIsExecuting('tab1')).toBe(false);
    });

    it('stores error on failure', async () => {
      mockedApi.executeQuery.mockRejectedValue(new Error('Query failed'));

      const result = await queryStore.executeQuery('tab1', 'conn1', 'testdb', 'invalid query');

      expect(result).toBe(null);
      expect(queryStore.getResults('tab1')).toBe(null);
      expect(queryStore.getError('tab1')).toBe('Query failed');
    });

    it('clears previous error on new query', async () => {
      // First query fails
      mockedApi.executeQuery.mockRejectedValueOnce(new Error('Failed'));
      await queryStore.executeQuery('tab1', 'conn1', 'db', 'bad query');
      expect(queryStore.getError('tab1')).toBe('Failed');

      // Second query succeeds
      mockedApi.executeQuery.mockResolvedValueOnce({
        documents: [],
        totalCount: 0,
        page: 1,
        pageSize: 50,
        hasMore: false,
        executionTimeMs: 1,
      });
      await queryStore.executeQuery('tab1', 'conn1', 'db', 'good query');
      expect(queryStore.getError('tab1')).toBe(null);
    });

    it('adds to history on successful query', async () => {
      mockedApi.executeQuery.mockResolvedValue({
        documents: [],
        totalCount: 0,
        page: 1,
        pageSize: 50,
        hasMore: false,
        executionTimeMs: 10,
      });

      await queryStore.executeQuery('tab1', 'conn1', 'testdb', 'db.test.find()');

      expect(queryStore.history).toHaveLength(1);
      expect(queryStore.history[0].query).toBe('db.test.find()');
      expect(queryStore.history[0].database).toBe('testdb');
      expect(queryStore.history[0].connectionId).toBe('conn1');
    });

    it('does not add to history on pagination', async () => {
      mockedApi.executeQuery.mockResolvedValue({
        documents: [],
        totalCount: 100,
        page: 2,
        pageSize: 50,
        hasMore: true,
        executionTimeMs: 5,
      });

      await queryStore.executeQuery('tab1', 'conn1', 'db', 'query', 2);

      expect(queryStore.history).toHaveLength(0);
    });
  });

  describe('results management', () => {
    it('clearResults removes results and errors', async () => {
      mockedApi.executeQuery.mockResolvedValue({
        documents: [{ _id: '1' }],
        totalCount: 1,
        page: 1,
        pageSize: 50,
        hasMore: false,
        executionTimeMs: 1,
      });

      await queryStore.executeQuery('tab1', 'conn1', 'db', 'query');
      expect(queryStore.getResults('tab1')).not.toBe(null);

      queryStore.clearResults('tab1');

      expect(queryStore.getResults('tab1')).toBe(null);
      expect(queryStore.getError('tab1')).toBe(null);
    });
  });

  describe('tab cleanup', () => {
    it('cleanupTab removes all tab state', async () => {
      queryStore.setQueryText('tab1', 'some query');
      mockedApi.executeQuery.mockResolvedValue({
        documents: [],
        totalCount: 0,
        page: 1,
        pageSize: 50,
        hasMore: false,
        executionTimeMs: 1,
      });
      await queryStore.executeQuery('tab1', 'conn1', 'db', 'query');

      queryStore.cleanupTab('tab1');

      expect(queryStore.getQueryText('tab1')).toBe('');
      expect(queryStore.getResults('tab1')).toBe(null);
      expect(queryStore.getIsExecuting('tab1')).toBe(false);
      expect(queryStore.getError('tab1')).toBe(null);
    });
  });

  describe('history', () => {
    it('addToHistory adds item to beginning', () => {
      const item1 = {
        id: '1',
        query: 'query1',
        database: 'db1',
        connectionId: 'conn1',
        timestamp: '2024-01-01',
      };
      const item2 = {
        id: '2',
        query: 'query2',
        database: 'db2',
        connectionId: 'conn1',
        timestamp: '2024-01-02',
      };

      queryStore.addToHistory(item1);
      queryStore.addToHistory(item2);

      expect(queryStore.history[0]).toEqual(item2);
      expect(queryStore.history[1]).toEqual(item1);
    });

    it('addToHistory removes duplicates', () => {
      const item1 = {
        id: '1',
        query: 'query',
        database: 'db',
        connectionId: 'conn',
        timestamp: '2024-01-01',
      };
      const item2 = {
        id: '2',
        query: 'query', // Same query
        database: 'db',
        connectionId: 'conn',
        timestamp: '2024-01-02',
      };

      queryStore.addToHistory(item1);
      queryStore.addToHistory(item2);

      expect(queryStore.history).toHaveLength(1);
      expect(queryStore.history[0].id).toBe('2');
    });

    it('addToHistory limits to 20 items', () => {
      for (let i = 0; i < 25; i++) {
        queryStore.addToHistory({
          id: `${i}`,
          query: `query${i}`,
          database: 'db',
          connectionId: 'conn',
          timestamp: `2024-01-${i + 1}`,
        });
      }

      expect(queryStore.history).toHaveLength(20);
      expect(queryStore.history[0].id).toBe('24'); // Most recent
    });

    it('clearHistory removes all history', () => {
      queryStore.addToHistory({
        id: '1',
        query: 'query',
        database: 'db',
        connectionId: 'conn',
        timestamp: '2024-01-01',
      });

      queryStore.clearHistory();

      expect(queryStore.history).toHaveLength(0);
    });
  });
});
