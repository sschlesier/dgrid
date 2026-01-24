// App Store - Svelte 5 runes-based state management

import type { ConnectionResponse, DatabaseInfo, CollectionInfo } from '../../../shared/contracts';
import type { Tab, Notification, UIState, Theme } from '../types';
import * as api from '../api/client';

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
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return { sidebarOpen: true, theme: 'system' };
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

  // Loading states
  isLoadingConnections = $state(false);
  isLoadingDatabases = $state(false);
  isConnecting = $state(false);

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

  async connect(id: string): Promise<void> {
    this.isConnecting = true;
    try {
      const connection = await api.connectToConnection(id);
      this.connections = this.connections.map((c) => (c.id === id ? connection : c));
      this.activeConnectionId = id;
      this.notify('success', `Connected to "${connection.name}"`);
      // Load databases after connecting
      await this.loadDatabases(id);
    } catch (error) {
      this.notify('error', `Failed to connect: ${(error as Error).message}`);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  async disconnect(id: string): Promise<void> {
    try {
      const connection = await api.disconnectFromConnection(id);
      this.connections = this.connections.map((c) => (c.id === id ? connection : c));
      if (this.activeConnectionId === id) {
        this.activeConnectionId = null;
        this.databases = [];
        this.collections = new Map();
      }
      this.notify('info', `Disconnected from "${connection.name}"`);
    } catch (error) {
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
      this.notify('error', `Failed to load databases: ${(error as Error).message}`);
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
      this.notify('error', `Failed to load collections: ${(error as Error).message}`);
      throw error;
    }
  }

  // Tab actions
  createTab(connectionId: string, database: string): Tab {
    const tab: Tab = {
      id: generateId(),
      title: 'New Query',
      type: 'query',
      connectionId,
      database,
      queryText: '',
    };
    this.tabs = [...this.tabs, tab];
    this.activeTabId = tab.id;
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
