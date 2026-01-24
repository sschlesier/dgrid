// Frontend-specific types

export interface Tab {
  id: string;
  title: string;
  type: 'query' | 'results' | 'drilldown';
  connectionId: string;
  database: string;
  queryText: string;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration: number;
}

export type Theme = 'light' | 'dark' | 'system';

export interface UIState {
  sidebarOpen: boolean;
  theme: Theme;
}

export interface QueryHistoryItem {
  id: string;
  query: string;
  database: string;
  connectionId: string;
  timestamp: string;
  executionTimeMs?: number;
}
