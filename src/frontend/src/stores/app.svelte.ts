// App Store - Svelte 5 runes-based state management

import type { ConnectionResponse, DatabaseInfo, CollectionInfo } from '../../../shared/contracts';
import type { Tab, Notification, UIState, Theme, TreeNodeData } from '../types';
import * as api from '../api/client';
import { ApiError } from '../api/client';
import { queryStore } from './query.svelte';
import { schemaStore } from './schema.svelte';

// Generate unique IDs
function generateId(): string {
  return crypto.randomUUID();
}

// localStorage keys
const UI_STATE_KEY = 'dgrid-ui-state';

// Load UI state from localStorage
function loadUIState(): UIState {
  try {
    const stored = localStorage.getItem(UI_STATE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        sidebarOpen: parsed.sidebarOpen ?? true,
        theme: parsed.theme ?? 'system',
        treeExpanded: parsed.treeExpanded ?? {},
        selectedTreeNode: parsed.selectedTreeNode ?? null,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { sidebarOpen: true, theme: 'system', treeExpanded: {}, selectedTreeNode: null };
}

// Save UI state to localStorage
function saveUIState(state: UIState): void {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

class AppStore {
  // State
  connections = $state<ConnectionResponse[]>([]);
  activeConnectionId = $state<string | null>(null);
  databases = $state<DatabaseInfo[]>([]);
  collections = $state<Map<string, CollectionInfo[]>>(new Map());
  tabs = $state<Tab[]>([]);
  activeTabId = $state<string | null>(null);
  ui = $state<UIState>(loadUIState());
  notifications = $state<Notification[]>([]);
  updateAvailable = $state<{ version: string; url: string } | null>(null);

  // Loading states
  isLoadingConnections = $state(false);
  isLoadingDatabases = $state(false);
  isConnecting = $state(false);

  constructor() {
    // Listen for connection-lost events dispatched by the query store (avoids circular import)
    window.addEventListener('dgrid:connection-lost', ((
      e: CustomEvent<{ connectionId: string }>
    ) => {
      const conn = this.connections.find((c) => c.id === e.detail.connectionId);
      if (conn?.isConnected) {
        this.markDisconnected(e.detail.connectionId);
        this.notify('warning', 'Connection lost — the server may be unreachable');
      }
    }) as EventListener);
  }

  // Derived state
  get activeConnection(): ConnectionResponse | undefined {
    return this.connections.find((c) => c.id === this.activeConnectionId);
  }

  get activeTab(): Tab | undefined {
    return this.tabs.find((t) => t.id === this.activeTabId);
  }

  get connectedConnections(): ConnectionResponse[] {
    return this.connections.filter((c) => c.isConnected);
  }

  // Connection actions
  async loadConnections(): Promise<void> {
    this.isLoadingConnections = true;
    try {
      this.connections = await api.getConnections();
    } catch (error) {
      this.notify('error', `Failed to load connections: ${(error as Error).message}`);
      throw error;
    } finally {
      this.isLoadingConnections = false;
    }
  }

  async createConnection(
    data: Parameters<typeof api.createConnection>[0]
  ): Promise<ConnectionResponse> {
    try {
      const connection = await api.createConnection(data);
      this.connections = [...this.connections, connection];
      this.notify('success', `Connection "${connection.name}" created`);
      return connection;
    } catch (error) {
      this.notify('error', `Failed to create connection: ${(error as Error).message}`);
      throw error;
    }
  }

  async updateConnection(
    id: string,
    data: Parameters<typeof api.updateConnection>[1]
  ): Promise<ConnectionResponse> {
    try {
      const connection = await api.updateConnection(id, data);
      this.connections = this.connections.map((c) => (c.id === id ? connection : c));
      this.notify('success', `Connection "${connection.name}" updated`);
      return connection;
    } catch (error) {
      this.notify('error', `Failed to update connection: ${(error as Error).message}`);
      throw error;
    }
  }

  async deleteConnection(id: string): Promise<void> {
    const connection = this.connections.find((c) => c.id === id);
    try {
      await api.deleteConnection(id);
      this.connections = this.connections.filter((c) => c.id !== id);
      if (this.activeConnectionId === id) {
        this.activeConnectionId = null;
        this.databases = [];
        this.collections = new Map();
      }
      // Close tabs for this connection
      this.tabs = this.tabs.filter((t) => t.connectionId !== id);
      if (connection) {
        this.notify('success', `Connection "${connection.name}" deleted`);
      }
    } catch (error) {
      this.notify('error', `Failed to delete connection: ${(error as Error).message}`);
      throw error;
    }
  }

  async connect(id: string, password?: string, savePassword?: boolean): Promise<void> {
    this.isConnecting = true;
    try {
      const connectData =
        password !== undefined || savePassword !== undefined
          ? { password, savePassword }
          : undefined;
      const connection = await api.connectToConnection(id, connectData);
      this.connections = this.connections.map((c) => (c.id === id ? connection : c));
      this.activeConnectionId = id;
      this.collapseConnectionTree(id);
      this.notify('success', `Connected to "${connection.name}"`);
      // Load databases after connecting
      await this.loadDatabases(id);
    } catch (error) {
      const errorMessage = this.getConnectionErrorMessage((error as Error).message);
      this.notify('error', errorMessage);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  // Provide actionable error messages for connection failures
  private getConnectionErrorMessage(errorMessage: string): string {
    const lowerError = errorMessage.toLowerCase();

    if (lowerError.includes('auth') || lowerError.includes('authentication failed')) {
      return 'Authentication failed - check your username and password';
    }

    if (lowerError.includes('econnrefused') || lowerError.includes('connection refused')) {
      return 'Connection refused - is MongoDB running on the specified host and port?';
    }

    if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
      return 'Connection timed out - check if the host is reachable';
    }

    if (lowerError.includes('enotfound') || lowerError.includes('getaddrinfo')) {
      return 'Host not found - check the hostname or IP address';
    }

    if (lowerError.includes('ssl') || lowerError.includes('tls')) {
      return 'SSL/TLS error - check your SSL configuration';
    }

    return `Failed to connect: ${errorMessage}`;
  }

  /** Handle backend signalling that a connection has dropped. */
  markDisconnected(id: string): void {
    this.connections = this.connections.map((c) =>
      c.id === id ? { ...c, isConnected: false } : c
    );
    if (this.activeConnectionId === id) {
      this.activeConnectionId = null;
      this.databases = [];
      this.collections = new Map();
    }
    schemaStore.clearConnection(id);
  }

  /** Check an error for backend disconnection signal and update state if needed. */
  private handlePossibleDisconnect(error: unknown, connectionId: string): void {
    if (error instanceof ApiError && error.isConnected === false) {
      const conn = this.connections.find((c) => c.id === connectionId);
      if (conn?.isConnected) {
        this.markDisconnected(connectionId);
        this.notify('warning', 'Connection lost — the server may be unreachable');
      }
    }
  }

  async disconnect(id: string): Promise<void> {
    const connName = this.connections.find((c) => c.id === id)?.name ?? id;
    try {
      const connection = await api.disconnectFromConnection(id);
      this.connections = this.connections.map((c) => (c.id === id ? connection : c));
      if (this.activeConnectionId === id) {
        this.activeConnectionId = null;
        this.databases = [];
        this.collections = new Map();
      }
      schemaStore.clearConnection(id);
      this.notify('info', `Disconnected from "${connection.name}"`);
    } catch (error) {
      // If backend says "not active", treat as success — already disconnected
      if (error instanceof ApiError && error.statusCode === 400) {
        this.markDisconnected(id);
        this.notify('info', `Disconnected from "${connName}"`);
        return;
      }
      this.notify('error', `Failed to disconnect: ${(error as Error).message}`);
      throw error;
    }
  }

  setActiveConnection(id: string | null): void {
    this.activeConnectionId = id;
    if (id) {
      const connection = this.connections.find((c) => c.id === id);
      if (connection?.isConnected) {
        this.loadDatabases(id);
      }
    }
  }

  // Database actions
  async loadDatabases(connectionId: string): Promise<void> {
    this.isLoadingDatabases = true;
    try {
      this.databases = await api.getDatabases(connectionId);
    } catch (error) {
      this.handlePossibleDisconnect(error, connectionId);
      if (!(error instanceof ApiError && error.isConnected === false)) {
        this.notify('error', `Failed to load databases: ${(error as Error).message}`);
      }
      throw error;
    } finally {
      this.isLoadingDatabases = false;
    }
  }

  async loadCollections(connectionId: string, database: string): Promise<void> {
    try {
      const collections = await api.getCollections(connectionId, database);
      const newMap = new Map(this.collections);
      newMap.set(database, collections);
      this.collections = newMap;
    } catch (error) {
      this.handlePossibleDisconnect(error, connectionId);
      if (!(error instanceof ApiError && error.isConnected === false)) {
        this.notify('error', `Failed to load collections: ${(error as Error).message}`);
      }
      throw error;
    }
  }

  // Refresh methods for tree controls
  async refreshConnections(): Promise<void> {
    try {
      await this.loadConnections();
      this.notify('success', 'Connections refreshed');
    } catch {
      // Error already notified in loadConnections
    }
  }

  async refreshDatabases(connectionId: string): Promise<void> {
    try {
      await this.loadDatabases(connectionId);
      this.notify('success', 'Databases refreshed');
    } catch {
      // Error already notified in loadDatabases
    }
  }

  async refreshCollections(connectionId: string, database: string): Promise<void> {
    try {
      await this.loadCollections(connectionId, database);
      this.notify('success', 'Collections refreshed');
    } catch {
      // Error already notified in loadCollections
    }
  }

  // Tab actions
  createTab(connectionId: string, database: string, collection?: string): Tab {
    const queryText = collection ? `db.${collection}.find({})` : '';
    const title = collection ? collection : 'New Query';
    const tab: Tab = {
      id: generateId(),
      title,
      type: 'query',
      connectionId,
      database,
      queryText,
    };
    this.tabs = [...this.tabs, tab];
    this.activeTabId = tab.id;
    // Initialize query store with the tab's initial query
    queryStore.setQueryText(tab.id, queryText);
    return tab;
  }

  closeTab(id: string): void {
    const index = this.tabs.findIndex((t) => t.id === id);
    this.tabs = this.tabs.filter((t) => t.id !== id);

    // Select adjacent tab if closing active tab
    if (this.activeTabId === id) {
      if (this.tabs.length === 0) {
        this.activeTabId = null;
      } else if (index >= this.tabs.length) {
        this.activeTabId = this.tabs[this.tabs.length - 1].id;
      } else {
        this.activeTabId = this.tabs[index].id;
      }
    }
  }

  setActiveTab(id: string): void {
    if (this.tabs.some((t) => t.id === id)) {
      this.activeTabId = id;
    }
  }

  updateTab(id: string, updates: Partial<Tab>): void {
    this.tabs = this.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t));
  }

  // UI actions
  toggleSidebar(): void {
    this.ui = { ...this.ui, sidebarOpen: !this.ui.sidebarOpen };
    saveUIState(this.ui);
  }

  setTheme(theme: Theme): void {
    this.ui = { ...this.ui, theme };
    saveUIState(this.ui);
    this.applyTheme();
  }

  applyTheme(): void {
    const root = document.documentElement;
    const theme = this.ui.theme;

    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }

  // Tree view state
  toggleTreeNode(nodeId: string): void {
    const newExpanded = { ...this.ui.treeExpanded };
    newExpanded[nodeId] = !newExpanded[nodeId];
    this.ui = { ...this.ui, treeExpanded: newExpanded };
    saveUIState(this.ui);
  }

  setTreeNodeExpanded(nodeId: string, expanded: boolean): void {
    if (this.ui.treeExpanded[nodeId] === expanded) return;
    const newExpanded = { ...this.ui.treeExpanded };
    newExpanded[nodeId] = expanded;
    this.ui = { ...this.ui, treeExpanded: newExpanded };
    saveUIState(this.ui);
  }

  collapseConnectionTree(connectionId: string): void {
    const newExpanded = { ...this.ui.treeExpanded };
    let changed = false;
    for (const key of Object.keys(newExpanded)) {
      if (key.includes(connectionId)) {
        delete newExpanded[key];
        changed = true;
      }
    }
    if (changed) {
      this.ui = { ...this.ui, treeExpanded: newExpanded };
      saveUIState(this.ui);
    }
  }

  selectTreeNode(nodeId: string | null): void {
    this.ui = { ...this.ui, selectedTreeNode: nodeId };
    saveUIState(this.ui);
  }

  isTreeNodeExpanded(nodeId: string): boolean {
    return this.ui.treeExpanded[nodeId] ?? false;
  }

  get treeData(): TreeNodeData[] {
    return this.connections.map((connection): TreeNodeData => {
      const connectionNodeId = `conn:${connection.id}`;
      const databases = connection.isConnected ? this.databases : [];

      return {
        id: connectionNodeId,
        type: 'connection',
        label: connection.name,
        connectionId: connection.id,
        isLoading: this.isConnecting && this.activeConnectionId === connection.id,
        children: connection.isConnected
          ? databases.map((db): TreeNodeData => {
              const dbNodeId = `db:${connection.id}:${db.name}`;
              const dbCollections = this.collections.get(db.name) ?? [];
              const regularCollections = dbCollections.filter((c) => c.type === 'collection');
              const views = dbCollections.filter((c) => c.type === 'view');

              return {
                id: dbNodeId,
                type: 'database',
                label: db.name,
                connectionId: connection.id,
                databaseName: db.name,
                isLoading: false,
                children: [
                  {
                    id: `coll-group:${connection.id}:${db.name}`,
                    type: 'collection-group',
                    label: 'Collections',
                    count: regularCollections.length,
                    connectionId: connection.id,
                    databaseName: db.name,
                    children: regularCollections.map((coll): TreeNodeData => {
                      const collNodeId = `coll:${connection.id}:${db.name}:${coll.name}`;
                      return {
                        id: collNodeId,
                        type: 'collection',
                        label: coll.name,
                        connectionId: connection.id,
                        databaseName: db.name,
                        collectionName: coll.name,
                        children:
                          coll.indexes > 0
                            ? [
                                {
                                  id: `idx-group:${connection.id}:${db.name}:${coll.name}`,
                                  type: 'index-group',
                                  label: 'Indexes',
                                  count: coll.indexes,
                                  connectionId: connection.id,
                                  databaseName: db.name,
                                  collectionName: coll.name,
                                },
                              ]
                            : undefined,
                      };
                    }),
                  },
                  {
                    id: `view-group:${connection.id}:${db.name}`,
                    type: 'view-group',
                    label: 'Views',
                    count: views.length,
                    connectionId: connection.id,
                    databaseName: db.name,
                    children: views.map(
                      (view): TreeNodeData => ({
                        id: `view:${connection.id}:${db.name}:${view.name}`,
                        type: 'view',
                        label: view.name,
                        connectionId: connection.id,
                        databaseName: db.name,
                        collectionName: view.name,
                      })
                    ),
                  },
                ],
              };
            })
          : undefined,
      };
    });
  }

  // Update check
  async checkForUpdates(): Promise<void> {
    try {
      const data = await api.getVersion();
      if (data.update) {
        this.updateAvailable = data.update;
      }
    } catch {
      // Silently ignore — update check is non-critical
    }
  }

  // Notification actions
  notify(type: Notification['type'], message: string, duration = 5000): void {
    const notification: Notification = {
      id: generateId(),
      type,
      message,
      duration,
    };
    this.notifications = [...this.notifications, notification];

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(notification.id);
      }, duration);
    }
  }

  dismiss(id: string): void {
    this.notifications = this.notifications.filter((n) => n.id !== id);
  }
}

// Singleton instance
export const appStore = new AppStore();
