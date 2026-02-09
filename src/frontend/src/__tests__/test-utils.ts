/**
 * Test utilities for Svelte 5 component testing
 */
import { vi } from 'vitest';
import type { ConnectionResponse, DatabaseInfo, CollectionInfo } from '../../../shared/contracts';
import type { Tab, Notification, UIState, TreeNodeData } from '../types';

// Mock connection data
export function createMockConnection(
  overrides: Partial<ConnectionResponse> = {}
): ConnectionResponse {
  return {
    id: 'conn-1',
    name: 'Test Connection',
    uri: 'mongodb://localhost:27017',
    isConnected: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// Mock database data
export function createMockDatabase(overrides: Partial<DatabaseInfo> = {}): DatabaseInfo {
  return {
    name: 'testdb',
    sizeOnDisk: 1024,
    empty: false,
    ...overrides,
  };
}

// Mock collection data
export function createMockCollection(overrides: Partial<CollectionInfo> = {}): CollectionInfo {
  return {
    name: 'testcollection',
    type: 'collection',
    documentCount: 0,
    avgDocumentSize: 0,
    totalSize: 0,
    indexes: 1,
    ...overrides,
  };
}

// Mock tab data
export function createMockTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: 'tab-1',
    title: 'Test Query',
    type: 'query',
    connectionId: 'conn-1',
    database: 'testdb',
    queryText: 'db.test.find({})',
    ...overrides,
  };
}

// Mock notification data
export function createMockNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-1',
    type: 'info',
    message: 'Test notification',
    duration: 5000,
    ...overrides,
  };
}

// Mock UI state
export function createMockUIState(overrides: Partial<UIState> = {}): UIState {
  return {
    sidebarOpen: true,
    theme: 'light',
    treeExpanded: {},
    selectedTreeNode: null,
    ...overrides,
  };
}

// Mock tree node data
export function createMockTreeNode(overrides: Partial<TreeNodeData> = {}): TreeNodeData {
  return {
    id: 'node-1',
    type: 'connection',
    label: 'Test Node',
    ...overrides,
  };
}

// App store mock type
export interface MockAppStore {
  connections: ConnectionResponse[];
  activeConnectionId: string | null;
  databases: DatabaseInfo[];
  collections: Map<string, CollectionInfo[]>;
  tabs: Tab[];
  activeTabId: string | null;
  ui: UIState;
  notifications: Notification[];
  isLoadingConnections: boolean;
  isLoadingDatabases: boolean;
  isConnecting: boolean;
  activeConnection: ConnectionResponse | undefined;
  activeTab: Tab | undefined;
  connectedConnections: ConnectionResponse[];
  treeData: TreeNodeData[];
  loadConnections: ReturnType<typeof vi.fn>;
  createConnection: ReturnType<typeof vi.fn>;
  updateConnection: ReturnType<typeof vi.fn>;
  deleteConnection: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  setActiveConnection: ReturnType<typeof vi.fn>;
  loadDatabases: ReturnType<typeof vi.fn>;
  loadCollections: ReturnType<typeof vi.fn>;
  createTab: ReturnType<typeof vi.fn>;
  closeTab: ReturnType<typeof vi.fn>;
  setActiveTab: ReturnType<typeof vi.fn>;
  updateTab: ReturnType<typeof vi.fn>;
  toggleSidebar: ReturnType<typeof vi.fn>;
  setTheme: ReturnType<typeof vi.fn>;
  applyTheme: ReturnType<typeof vi.fn>;
  toggleTreeNode: ReturnType<typeof vi.fn>;
  selectTreeNode: ReturnType<typeof vi.fn>;
  isTreeNodeExpanded: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
  dismiss: ReturnType<typeof vi.fn>;
}

// App store mock factory
export function createMockAppStore(overrides: Partial<MockAppStore> = {}): MockAppStore {
  const store: MockAppStore = {
    connections: [],
    activeConnectionId: null,
    databases: [],
    collections: new Map<string, CollectionInfo[]>(),
    tabs: [],
    activeTabId: null,
    ui: createMockUIState(),
    notifications: [],
    isLoadingConnections: false,
    isLoadingDatabases: false,
    isConnecting: false,
    get activeConnection(): ConnectionResponse | undefined {
      return store.connections.find((c) => c.id === store.activeConnectionId);
    },
    get activeTab(): Tab | undefined {
      return store.tabs.find((t) => t.id === store.activeTabId);
    },
    get connectedConnections(): ConnectionResponse[] {
      return store.connections.filter((c) => c.isConnected);
    },
    get treeData(): TreeNodeData[] {
      return [];
    },
    loadConnections: vi.fn(),
    createConnection: vi.fn(),
    updateConnection: vi.fn(),
    deleteConnection: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    setActiveConnection: vi.fn(),
    loadDatabases: vi.fn(),
    loadCollections: vi.fn(),
    createTab: vi.fn(),
    closeTab: vi.fn(),
    setActiveTab: vi.fn(),
    updateTab: vi.fn(),
    toggleSidebar: vi.fn(),
    setTheme: vi.fn(),
    applyTheme: vi.fn(),
    toggleTreeNode: vi.fn(),
    selectTreeNode: vi.fn(),
    isTreeNodeExpanded: vi.fn().mockReturnValue(false),
    notify: vi.fn(),
    dismiss: vi.fn(),
    ...overrides,
  };
  return store;
}

// Query store mock type
export interface MockQueryStore {
  queryTexts: Map<string, string>;
  results: Map<string, unknown>;
  isExecuting: Map<string, boolean>;
  errors: Map<string, string | null>;
  history: unknown[];
  getQueryText: ReturnType<typeof vi.fn>;
  setQueryText: ReturnType<typeof vi.fn>;
  getResults: ReturnType<typeof vi.fn>;
  getIsExecuting: ReturnType<typeof vi.fn>;
  getError: ReturnType<typeof vi.fn>;
  executeQuery: ReturnType<typeof vi.fn>;
  cancelQuery: ReturnType<typeof vi.fn>;
  loadPage: ReturnType<typeof vi.fn>;
  clearResults: ReturnType<typeof vi.fn>;
  cleanupTab: ReturnType<typeof vi.fn>;
  addToHistory: ReturnType<typeof vi.fn>;
  clearHistory: ReturnType<typeof vi.fn>;
  loadHistory: ReturnType<typeof vi.fn>;
}

// Query store mock factory
export function createMockQueryStore(overrides: Partial<MockQueryStore> = {}): MockQueryStore {
  return {
    queryTexts: new Map<string, string>(),
    results: new Map(),
    isExecuting: new Map<string, boolean>(),
    errors: new Map<string, string | null>(),
    history: [],
    getQueryText: vi.fn().mockReturnValue(''),
    setQueryText: vi.fn(),
    getResults: vi.fn().mockReturnValue(null),
    getIsExecuting: vi.fn().mockReturnValue(false),
    getError: vi.fn().mockReturnValue(null),
    executeQuery: vi.fn(),
    cancelQuery: vi.fn(),
    loadPage: vi.fn(),
    clearResults: vi.fn(),
    cleanupTab: vi.fn(),
    addToHistory: vi.fn(),
    clearHistory: vi.fn(),
    loadHistory: vi.fn(),
    ...overrides,
  };
}

// Grid store mock type
export interface MockGridStore {
  getState: ReturnType<typeof vi.fn>;
  getColumns: ReturnType<typeof vi.fn>;
  getSort: ReturnType<typeof vi.fn>;
  getDrilldown: ReturnType<typeof vi.fn>;
  getPageSize: ReturnType<typeof vi.fn>;
  setColumns: ReturnType<typeof vi.fn>;
  setColumnWidth: ReturnType<typeof vi.fn>;
  toggleSort: ReturnType<typeof vi.fn>;
  drillInto: ReturnType<typeof vi.fn>;
  drillBack: ReturnType<typeof vi.fn>;
  drillForward: ReturnType<typeof vi.fn>;
  drillToSegment: ReturnType<typeof vi.fn>;
  canDrillBack: ReturnType<typeof vi.fn>;
  canDrillForward: ReturnType<typeof vi.fn>;
  setPageSize: ReturnType<typeof vi.fn>;
  resetState: ReturnType<typeof vi.fn>;
}

// Grid store mock factory
export function createMockGridStore(overrides: Partial<MockGridStore> = {}): MockGridStore {
  return {
    getState: vi.fn().mockReturnValue({
      columns: [],
      sort: { column: null, direction: null },
      drilldown: { path: [], history: [] },
      pageSize: 50,
    }),
    getColumns: vi.fn().mockReturnValue([]),
    getSort: vi.fn().mockReturnValue({ column: null, direction: null }),
    getDrilldown: vi.fn().mockReturnValue({ path: [], history: [] }),
    getPageSize: vi.fn().mockReturnValue(50),
    setColumns: vi.fn(),
    setColumnWidth: vi.fn(),
    toggleSort: vi.fn(),
    drillInto: vi.fn(),
    drillBack: vi.fn(),
    drillForward: vi.fn(),
    drillToSegment: vi.fn(),
    canDrillBack: vi.fn().mockReturnValue(false),
    canDrillForward: vi.fn().mockReturnValue(false),
    setPageSize: vi.fn(),
    resetState: vi.fn(),
    ...overrides,
  };
}

// Editor store mock type
export interface MockEditorStore {
  vimMode: boolean;
  recentPaths: string[];
  toggleVimMode: ReturnType<typeof vi.fn>;
  addRecentPath: ReturnType<typeof vi.fn>;
}

// Editor store mock factory
export function createMockEditorStore(overrides: Partial<MockEditorStore> = {}): MockEditorStore {
  return {
    vimMode: false,
    recentPaths: [],
    toggleVimMode: vi.fn(),
    addRecentPath: vi.fn(),
    ...overrides,
  };
}

// API mock factory
export function createMockApi() {
  return {
    getConnections: vi.fn(),
    getConnection: vi.fn(),
    createConnection: vi.fn(),
    updateConnection: vi.fn(),
    deleteConnection: vi.fn(),
    testConnection: vi.fn(),
    connectToConnection: vi.fn(),
    disconnectFromConnection: vi.fn(),
    getDatabases: vi.fn(),
    getCollections: vi.fn(),
    executeQuery: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  };
}

// Simulate keyboard event
export function simulateKeyDown(
  key: string,
  options: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {}
): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key,
    metaKey: options.meta ?? false,
    ctrlKey: options.ctrl ?? false,
    shiftKey: options.shift ?? false,
    altKey: options.alt ?? false,
    bubbles: true,
    cancelable: true,
  });
}

// Simulate click event
export function simulateClick(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

// Simulate input change
export function simulateInput(element: HTMLInputElement, value: string): void {
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

// Wait for async effects
export async function waitForEffects(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// Wait for condition with timeout
export async function waitFor(
  condition: () => boolean,
  timeout = 1000,
  interval = 50
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('waitFor timeout exceeded');
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
