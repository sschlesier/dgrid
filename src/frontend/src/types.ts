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
  treeExpanded: Record<string, boolean>;
  selectedTreeNode: string | null;
}

export type TreeNodeType =
  | 'connection'
  | 'database'
  | 'collection-group'
  | 'view-group'
  | 'collection'
  | 'view'
  | 'index-group'
  | 'index';

export interface TreeNodeData {
  id: string;
  type: TreeNodeType;
  label: string;
  count?: number;
  isLoading?: boolean;
  children?: TreeNodeData[];
  connectionId?: string;
  databaseName?: string;
  collectionName?: string;
}

export interface QueryHistoryItem {
  id: string;
  query: string;
  database: string;
  connectionId: string;
  timestamp: string;
  executionTimeMs?: number;
}

// Multi-query execution types
export type ExecuteMode = 'all' | 'current' | 'selected';

export interface SubQueryResult {
  index: number;
  query: string;
  result: import('../../shared/contracts').ExecuteQueryResponse | null;
  error: string | null;
  isExecuting: boolean;
}

export interface ExecuteInfo {
  mode: ExecuteMode;
  cursorOffset: number;
  selectionFrom: number;
  selectionTo: number;
  hasSelection: boolean;
}
