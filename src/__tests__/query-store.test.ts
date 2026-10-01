import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the API module before importing the store
vi.mock('../api/client', () => ({
  executeQuery: vi.fn(),
  QueryCancelledError: class extends Error {
    constructor() {
      super('Query was cancelled');
      this.name = 'QueryCancelledError';
    }
  },
  ApiError: class extends Error {
    isConnected?: boolean;
    constructor(
      public statusCode: number,
      public errorType: string,
      message: string,
      public details?: Record<string, unknown>
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

// Import after mocking
import * as api from '../api/client';
import {
  HISTORY_STORAGE_BUDGET,
  queryStore,
  selectEntriesForStorage,
} from '../stores/query.svelte';
import type { QueryHistoryItem } from '../types';

const mockedApi = api as unknown as {
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

    it('addToHistory limits to 200 items', () => {
      for (let i = 0; i < 201; i++) {
        queryStore.addToHistory({
          id: `${i}`,
          query: `query${i}`,
          database: 'db',
          connectionId: 'conn',
          timestamp: `2024-01-${i + 1}`,
        });
      }

      expect(queryStore.history).toHaveLength(200);
      expect(queryStore.history[0].id).toBe('200'); // Most recent
      expect(queryStore.history[199].id).toBe('1'); // Oldest dropped
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

  describe('history storage budget', () => {
    const HISTORY_KEY = 'dgrid-query-history';

    function entry(id: string, querySize = 10): QueryHistoryItem {
      return {
        id,
        query: `q${id}`.padEnd(querySize, 'x'),
        database: 'db',
        connectionId: 'conn',
        timestamp: '2024-01-01',
      };
    }

    function storedHistory(): QueryHistoryItem[] {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    }

    function ids(items: QueryHistoryItem[]): string[] {
      return items.map((item) => item.id);
    }

    // Adds entries oldest first, so the last one ends up newest.
    function addAll(items: QueryHistoryItem[]): void {
      for (const item of items) queryStore.addToHistory(item);
    }

    beforeEach(() => {
      localStorage.clear();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('drops the largest entries, not the oldest, and preserves order', () => {
      // newest first: small, large, small, large, small
      const history = [entry('a'), entry('b', 400), entry('c'), entry('d', 300), entry('e')];
      const budget = JSON.stringify(history).length - 200;

      const selected = selectEntriesForStorage(history, budget);

      expect(ids(selected)).toEqual(['a', 'c', 'd', 'e']);
      expect(JSON.stringify(selected).length).toBeLessThanOrEqual(budget);
    });

    it('drops the older entry first among equal sizes', () => {
      const history = [entry('a'), entry('b', 300), entry('c', 300)];
      const budget = JSON.stringify(history).length - 100;

      expect(ids(selectEntriesForStorage(history, budget))).toEqual(['a', 'b']);
    });

    it('keeps the newest entry when it is the largest but fits', () => {
      const history = [entry('a', 500), entry('b', 300), entry('c'), entry('d', 200)];
      const budget = JSON.stringify(history).length - 100;

      expect(ids(selectEntriesForStorage(history, budget))).toEqual(['a', 'c', 'd']);
    });

    it('keeps every entry when the history fits the budget exactly', () => {
      const history = [entry('a'), entry('b', 300), entry('c')];
      const budget = JSON.stringify(history).length;

      expect(selectEntriesForStorage(history, budget)).toEqual(history);
      expect(ids(selectEntriesForStorage(history, budget - 1))).toEqual(['a', 'c']);
    });

    it('keeps a newest entry that alone fits the budget exactly', () => {
      const history = [entry('a', 300)];
      const budget = JSON.stringify(history).length;

      expect(selectEntriesForStorage(history, budget)).toEqual(history);
      expect(selectEntriesForStorage(history, budget - 1)).toEqual([]);
    });

    it('drops only as many entries as needed to fit', () => {
      const history = [entry('a'), entry('b', 300), entry('c', 200), entry('d')];
      const budget = JSON.stringify([entry('a'), entry('c', 200), entry('d')]).length;

      expect(ids(selectEntriesForStorage(history, budget))).toEqual(['a', 'c', 'd']);
    });

    it('uses a 1,500,000-character budget', () => {
      expect(HISTORY_STORAGE_BUDGET).toBe(1_500_000);
    });

    it('drops a newest entry that alone exceeds the budget and keeps the rest', () => {
      const history = [entry('a', 1000), entry('b'), entry('c')];

      expect(ids(selectEntriesForStorage(history, 500))).toEqual(['b', 'c']);
    });

    it('saves at most the budget and keeps short queries over large ones', () => {
      const small = Array.from({ length: 20 }, (_, i) => entry(`s${i}`));
      const large = Array.from({ length: 70 }, (_, i) => entry(`l${i}`, 25_000));

      addAll([...small, ...large]);

      const saved = localStorage.getItem(HISTORY_KEY) ?? '';
      expect(saved.length).toBeLessThanOrEqual(HISTORY_STORAGE_BUDGET);
      expect(ids(storedHistory())).toEqual(expect.arrayContaining(ids(small)));
      expect(storedHistory()[0].id).toBe('l69');
    });

    it('keeps the in-memory history equal to the saved history', () => {
      addAll([entry('a'), entry('b'), entry('c', HISTORY_STORAGE_BUDGET)]);

      expect(ids(queryStore.history)).toEqual(['b', 'a']);
      expect(storedHistory()).toEqual(queryStore.history);
    });

    // Replaces localStorage with one whose keys and values share a quota of `quota`
    // characters, like a browser's per-origin limit.
    function stubQuotaStorage(quota: number): Map<string, string> {
      const data = new Map<string, string>();
      const used = () => [...data].reduce((sum, [k, v]) => sum + k.length + v.length, 0);
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => {
          const current = data.get(key);
          const others = used() - (current === undefined ? 0 : key.length + current.length);
          if (others + key.length + value.length > quota) {
            throw new DOMException('full', 'QuotaExceededError');
          }
          data.set(key, value);
        },
        removeItem: (key: string) => data.delete(key),
        clear: () => data.clear(),
      });
      return data;
    }

    it('retries with fewer entries when setItem throws and never throws itself', () => {
      addAll(Array.from({ length: 10 }, (_, i) => entry(`${i}`, 1000)));
      stubQuotaStorage(4000);
      const setItem = vi.spyOn(localStorage, 'setItem');

      expect(() => queryStore.addToHistory(entry('new', 1000))).not.toThrow();

      // Each retry is at most half the size of the attempt before it.
      const attempts = setItem.mock.calls.map(([, value]) => value.length);
      expect(attempts.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < attempts.length; i++) {
        expect(attempts[i]).toBeLessThanOrEqual(Math.floor(attempts[i - 1] / 2));
      }
      const saved = storedHistory();
      expect(saved[0].id).toBe('new');
      expect(JSON.stringify(saved).length).toBeLessThanOrEqual(4000);
      expect(queryStore.history).toEqual(saved);
    });

    it('keeps a newest entry that fits alone when a quota retry halves the budget', () => {
      stubQuotaStorage(11_000);
      addAll([entry('a', 1000), entry('b', 1000), entry('c', 1000)]);

      queryStore.addToHistory(entry('new', 10_000));

      expect(ids(storedHistory())).toEqual(['new']);
      expect(queryStore.history).toEqual(storedHistory());
    });

    it('removes the stored history when even an empty list cannot be saved', () => {
      const data = stubQuotaStorage(0);
      data.set(HISTORY_KEY, JSON.stringify([entry('old')]));

      queryStore.addToHistory(entry('new'));

      expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
      expect(queryStore.history).toEqual([]);
    });

    it('frees quota for other stores after history hits it', () => {
      const data = stubQuotaStorage(1_600_000);
      data.set('dgrid-other', 'x'.repeat(200_000));

      addAll(Array.from({ length: 70 }, (_, i) => entry(`l${i}`, 25_000)));

      expect(() =>
        localStorage.setItem('dgrid-grid-column-widths', JSON.stringify({ name: 120 }))
      ).not.toThrow();
      expect(queryStore.history[0].id).toBe('l69');
      expect(queryStore.history).toEqual(storedHistory());
    });

    it('trims an over-budget stored history on load', () => {
      const history = [entry('a'), entry('b', HISTORY_STORAGE_BUDGET), entry('c')];
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

      queryStore.loadHistory();

      expect(ids(queryStore.history)).toEqual(['a', 'c']);
    });

    it('loads a stored history within the budget unchanged', () => {
      const history = [entry('a'), entry('b')];
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

      queryStore.loadHistory();

      expect(queryStore.history).toEqual(history);
    });

    it('clearHistory saves an empty list', () => {
      addAll([entry('a')]);

      queryStore.clearHistory();

      expect(localStorage.getItem(HISTORY_KEY)).toBe('[]');
    });
  });
});
