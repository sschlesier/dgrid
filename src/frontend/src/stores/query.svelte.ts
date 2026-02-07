// Query Store - Per-tab query state management with Svelte 5 runes

import type { ExecuteQueryResponse } from '../../../shared/contracts';
import type { QueryHistoryItem } from '../types';
import * as api from '../api/client';
import { QueryCancelledError } from '../api/client';

// localStorage keys
const HISTORY_KEY = 'dgrid-query-history';
const MAX_HISTORY_ITEMS = 20;

// Generate unique IDs
function generateId(): string {
  return crypto.randomUUID();
}

// Load history from localStorage
function loadHistory(): QueryHistoryItem[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

// Save history to localStorage
function saveHistory(history: QueryHistoryItem[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage errors
  }
}

class QueryStore {
  // Per-tab state using Maps
  queryTexts = $state<Map<string, string>>(new Map());
  results = $state<Map<string, ExecuteQueryResponse | null>>(new Map());
  isExecuting = $state<Map<string, boolean>>(new Map());
  errors = $state<Map<string, string | null>>(new Map());

  // Abort controllers for cancellable queries (not reactive, internal only)
  private abortControllers: Map<string, AbortController> = new Map();

  // Global history (last 20 queries)
  history = $state<QueryHistoryItem[]>(loadHistory());

  // Query text management
  getQueryText(tabId: string): string {
    return this.queryTexts.get(tabId) ?? '';
  }

  setQueryText(tabId: string, text: string): void {
    const newMap = new Map(this.queryTexts);
    newMap.set(tabId, text);
    this.queryTexts = newMap;
  }

  // Results management
  getResults(tabId: string): ExecuteQueryResponse | null {
    return this.results.get(tabId) ?? null;
  }

  getIsExecuting(tabId: string): boolean {
    return this.isExecuting.get(tabId) ?? false;
  }

  getError(tabId: string): string | null {
    return this.errors.get(tabId) ?? null;
  }

  // Execute query
  async executeQuery(
    tabId: string,
    connectionId: string,
    database: string,
    query: string,
    page = 1,
    pageSize: 50 | 100 | 250 | 500 = 50,
    silent = false
  ): Promise<ExecuteQueryResponse | null> {
    // Cancel any existing query for this tab
    this.cancelQuery(tabId);

    // Create new abort controller
    const abortController = new AbortController();
    this.abortControllers.set(tabId, abortController);

    // Set executing state (skip when silent to keep view mounted)
    if (!silent) {
      const newExecuting = new Map(this.isExecuting);
      newExecuting.set(tabId, true);
      this.isExecuting = newExecuting;
    }

    // Clear previous error
    const newErrors = new Map(this.errors);
    newErrors.set(tabId, null);
    this.errors = newErrors;

    try {
      const result = await api.executeQuery(
        connectionId,
        {
          query,
          database,
          page,
          pageSize,
        },
        { signal: abortController.signal }
      );

      // Store results
      const newResults = new Map(this.results);
      newResults.set(tabId, result);
      this.results = newResults;

      // Add to history (only on first page)
      if (page === 1) {
        this.addToHistory({
          id: generateId(),
          query,
          database,
          connectionId,
          timestamp: new Date().toISOString(),
          executionTimeMs: result.executionTimeMs,
        });
      }

      return result;
    } catch (error) {
      // Don't store error for cancelled queries
      if (error instanceof QueryCancelledError) {
        return null;
      }

      // Store error
      const newErrors = new Map(this.errors);
      newErrors.set(tabId, (error as Error).message);
      this.errors = newErrors;

      // Clear results
      const newResults = new Map(this.results);
      newResults.set(tabId, null);
      this.results = newResults;

      return null;
    } finally {
      // Clean up abort controller
      this.abortControllers.delete(tabId);

      // Clear executing state
      const newExecuting = new Map(this.isExecuting);
      newExecuting.set(tabId, false);
      this.isExecuting = newExecuting;
    }
  }

  // Cancel a running query
  cancelQuery(tabId: string): void {
    const controller = this.abortControllers.get(tabId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(tabId);
    }
  }

  // Load next/previous page
  async loadPage(
    tabId: string,
    connectionId: string,
    database: string,
    query: string,
    page: number,
    pageSize: 50 | 100 | 250 | 500 = 50,
    silent = false
  ): Promise<ExecuteQueryResponse | null> {
    return this.executeQuery(tabId, connectionId, database, query, page, pageSize, silent);
  }

  // Clear results for a tab
  clearResults(tabId: string): void {
    const newResults = new Map(this.results);
    newResults.delete(tabId);
    this.results = newResults;

    const newErrors = new Map(this.errors);
    newErrors.delete(tabId);
    this.errors = newErrors;
  }

  // Clean up tab state when tab is closed
  cleanupTab(tabId: string): void {
    // Cancel any running query
    this.cancelQuery(tabId);

    const newQueryTexts = new Map(this.queryTexts);
    newQueryTexts.delete(tabId);
    this.queryTexts = newQueryTexts;

    const newResults = new Map(this.results);
    newResults.delete(tabId);
    this.results = newResults;

    const newIsExecuting = new Map(this.isExecuting);
    newIsExecuting.delete(tabId);
    this.isExecuting = newIsExecuting;

    const newErrors = new Map(this.errors);
    newErrors.delete(tabId);
    this.errors = newErrors;
  }

  // History management
  addToHistory(item: QueryHistoryItem): void {
    // Remove duplicates (same query + database + connection)
    const filtered = this.history.filter(
      (h) =>
        !(
          h.query === item.query &&
          h.database === item.database &&
          h.connectionId === item.connectionId
        )
    );

    // Add new item at the beginning
    this.history = [item, ...filtered].slice(0, MAX_HISTORY_ITEMS);
    saveHistory(this.history);
  }

  clearHistory(): void {
    this.history = [];
    saveHistory(this.history);
  }

  loadHistory(): void {
    this.history = loadHistory();
  }
}

// Singleton instance
export const queryStore = new QueryStore();
