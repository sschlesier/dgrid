// Query Store - Per-tab query state management with Svelte 5 runes

import type { ExecuteQueryResponse } from '../../../shared/contracts';
import type { QueryHistoryItem, SubQueryResult, ExecuteMode } from '../types';
import type { QuerySlice } from '../../../shared/querySplitter';
import * as api from '../api/client';
import { ApiError, QueryCancelledError } from '../api/client';

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

  // Multi-query state
  subResults = $state<Map<string, SubQueryResult[]>>(new Map());
  activeResultIndex = $state<Map<string, number>>(new Map());
  lastExecuteMode = $state<ExecuteMode>('all');

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
    // Backward-compatible: returns the active sub-result's response
    const subs = this.subResults.get(tabId);
    if (subs && subs.length > 0) {
      const idx = this.activeResultIndex.get(tabId) ?? 0;
      return subs[idx]?.result ?? null;
    }
    return this.results.get(tabId) ?? null;
  }

  getIsExecuting(tabId: string): boolean {
    return this.isExecuting.get(tabId) ?? false;
  }

  getError(tabId: string): string | null {
    // For multi-query mode, return null here — errors are per sub-result
    const subs = this.subResults.get(tabId);
    if (subs && subs.length > 0) {
      return null;
    }
    return this.errors.get(tabId) ?? null;
  }

  // Multi-query accessors
  getSubResults(tabId: string): SubQueryResult[] {
    return this.subResults.get(tabId) ?? [];
  }

  getActiveResultIndex(tabId: string): number {
    return this.activeResultIndex.get(tabId) ?? 0;
  }

  setActiveResultIndex(tabId: string, idx: number): void {
    const newMap = new Map(this.activeResultIndex);
    newMap.set(tabId, idx);
    this.activeResultIndex = newMap;
  }

  getActiveResult(tabId: string): SubQueryResult | null {
    const subs = this.subResults.get(tabId);
    if (!subs || subs.length === 0) return null;
    const idx = this.activeResultIndex.get(tabId) ?? 0;
    return subs[idx] ?? null;
  }

  // Execute a single query (backward-compatible path)
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

    // Clear multi-query state
    const newSubs = new Map(this.subResults);
    newSubs.delete(tabId);
    this.subResults = newSubs;

    const newIdx = new Map(this.activeResultIndex);
    newIdx.delete(tabId);
    this.activeResultIndex = newIdx;

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

      // Notify about connection loss via custom event (avoids circular import with appStore)
      if (error instanceof ApiError && error.isConnected === false) {
        window.dispatchEvent(
          new CustomEvent('dgrid:connection-lost', { detail: { connectionId } })
        );
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

  // Execute multiple queries sequentially
  async executeQueries(
    tabId: string,
    connectionId: string,
    database: string,
    queries: QuerySlice[],
    pageSize: 50 | 100 | 250 | 500 = 50
  ): Promise<void> {
    // If only one query, use the single-query path for backward compat
    if (queries.length === 1) {
      await this.executeQuery(tabId, connectionId, database, queries[0].text, 1, pageSize);
      return;
    }

    // Cancel any existing query for this tab
    this.cancelQuery(tabId);

    // Clear single-query state
    const newResults = new Map(this.results);
    newResults.delete(tabId);
    this.results = newResults;
    const newErrors = new Map(this.errors);
    newErrors.delete(tabId);
    this.errors = newErrors;

    // Initialize sub-results
    const initialSubs: SubQueryResult[] = queries.map((q, i) => ({
      index: i,
      query: q.text,
      result: null,
      error: null,
      isExecuting: false,
    }));

    const newSubs = new Map(this.subResults);
    newSubs.set(tabId, initialSubs);
    this.subResults = newSubs;

    // Reset active index to 0
    const newIdx = new Map(this.activeResultIndex);
    newIdx.set(tabId, 0);
    this.activeResultIndex = newIdx;

    // Set global executing state
    const newExecuting = new Map(this.isExecuting);
    newExecuting.set(tabId, true);
    this.isExecuting = newExecuting;

    // Create abort controller for the whole batch
    const abortController = new AbortController();
    this.abortControllers.set(tabId, abortController);

    // Add only the first query to history
    this.addToHistory({
      id: generateId(),
      query: queries[0].text,
      database,
      connectionId,
      timestamp: new Date().toISOString(),
    });

    try {
      for (let i = 0; i < queries.length; i++) {
        // Check for cancellation before starting each query
        if (abortController.signal.aborted) break;

        // Mark current sub-result as executing
        this.updateSubResult(tabId, i, { isExecuting: true });

        try {
          const result = await api.executeQuery(
            connectionId,
            {
              query: queries[i].text,
              database,
              page: 1,
              pageSize,
            },
            { signal: abortController.signal }
          );

          this.updateSubResult(tabId, i, {
            result,
            isExecuting: false,
          });
        } catch (error) {
          if (error instanceof QueryCancelledError || abortController.signal.aborted) {
            // Mark this and all remaining as not executing
            this.updateSubResult(tabId, i, { isExecuting: false });
            break;
          }

          if (error instanceof ApiError && error.isConnected === false) {
            window.dispatchEvent(
              new CustomEvent('dgrid:connection-lost', { detail: { connectionId } })
            );
          }

          // Store error for this sub-result, continue with next
          this.updateSubResult(tabId, i, {
            error: (error as Error).message,
            isExecuting: false,
          });
        }
      }
    } finally {
      this.abortControllers.delete(tabId);

      const newExecuting = new Map(this.isExecuting);
      newExecuting.set(tabId, false);
      this.isExecuting = newExecuting;
    }
  }

  // Update a single sub-result immutably
  private updateSubResult(tabId: string, index: number, updates: Partial<SubQueryResult>): void {
    const subs = this.subResults.get(tabId);
    if (!subs) return;

    const newSubs = subs.map((s, i) => (i === index ? { ...s, ...updates } : s));
    const newMap = new Map(this.subResults);
    newMap.set(tabId, newSubs);
    this.subResults = newMap;
  }

  // Cancel a running query
  cancelQuery(tabId: string): void {
    const controller = this.abortControllers.get(tabId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(tabId);
    }
  }

  // Load next/previous page for a specific sub-result
  async loadPage(
    tabId: string,
    connectionId: string,
    database: string,
    query: string,
    page: number,
    pageSize: 50 | 100 | 250 | 500 = 50,
    silent = false,
    resultIndex?: number
  ): Promise<ExecuteQueryResponse | null> {
    const subs = this.subResults.get(tabId);
    if (subs && subs.length > 1 && resultIndex !== undefined) {
      // Multi-query mode: update the specific sub-result
      const abortController = new AbortController();
      this.abortControllers.set(tabId, abortController);

      this.updateSubResult(tabId, resultIndex, { isExecuting: true });

      try {
        const result = await api.executeQuery(
          connectionId,
          { query, database, page, pageSize },
          { signal: abortController.signal }
        );

        this.updateSubResult(tabId, resultIndex, { result, isExecuting: false });
        return result;
      } catch (error) {
        if (!(error instanceof QueryCancelledError)) {
          this.updateSubResult(tabId, resultIndex, {
            error: (error as Error).message,
            isExecuting: false,
          });
        } else {
          this.updateSubResult(tabId, resultIndex, { isExecuting: false });
        }
        return null;
      } finally {
        this.abortControllers.delete(tabId);
      }
    }

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

    const newSubs = new Map(this.subResults);
    newSubs.delete(tabId);
    this.subResults = newSubs;

    const newIdx = new Map(this.activeResultIndex);
    newIdx.delete(tabId);
    this.activeResultIndex = newIdx;
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

    const newSubs = new Map(this.subResults);
    newSubs.delete(tabId);
    this.subResults = newSubs;

    const newIdx = new Map(this.activeResultIndex);
    newIdx.delete(tabId);
    this.activeResultIndex = newIdx;
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
