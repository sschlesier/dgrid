import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the API module before importing the store
vi.mock('../api/client', () => ({
  getConnections: vi.fn(),
  createConnection: vi.fn(),
  updateConnection: vi.fn(),
  deleteConnection: vi.fn(),
  connectToConnection: vi.fn(),
  disconnectFromConnection: vi.fn(),
  getDatabases: vi.fn(),
  getCollections: vi.fn(),
}));

// Import after mocking
import * as api from '../api/client';
import { appStore } from '../stores/app.svelte';

const mockedApi = api as unknown as {
  getConnections: ReturnType<typeof vi.fn>;
  createConnection: ReturnType<typeof vi.fn>;
  updateConnection: ReturnType<typeof vi.fn>;
  deleteConnection: ReturnType<typeof vi.fn>;
  connectToConnection: ReturnType<typeof vi.fn>;
  disconnectFromConnection: ReturnType<typeof vi.fn>;
  getDatabases: ReturnType<typeof vi.fn>;
  getCollections: ReturnType<typeof vi.fn>;
};

describe('appStore', () => {
  beforeEach(() => {
    // Reset store state
    appStore.connections = [];
    appStore.activeConnectionId = null;
    appStore.databases = [];
    appStore.collections = new Map();
    appStore.tabs = [];
    appStore.activeTabId = null;
    appStore.notifications = [];

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('connections', () => {
    it('loadConnections fetches and stores connections', async () => {
      const connections = [
        { id: '1', name: 'Test', host: 'localhost', port: 27017, isConnected: false },
      ];
      mockedApi.getConnections.mockResolvedValue(connections);

      await appStore.loadConnections();

      expect(appStore.connections).toEqual(connections);
      expect(appStore.isLoadingConnections).toBe(false);
    });

    it('createConnection adds connection to store', async () => {
      const newConnection = { name: 'New', host: 'localhost', port: 27017 };
      const created = { id: '1', ...newConnection, isConnected: false };
      mockedApi.createConnection.mockResolvedValue(created);

      const result = await appStore.createConnection(newConnection);

      expect(result).toEqual(created);
      expect(appStore.connections).toContainEqual(created);
      expect(appStore.notifications).toHaveLength(1);
      expect(appStore.notifications[0].type).toBe('success');
    });

    it('updateConnection updates connection in store', async () => {
      appStore.connections = [
        {
          id: '1',
          name: 'Old',
          host: 'localhost',
          port: 27017,
          isConnected: false,
          createdAt: '',
          updatedAt: '',
        },
      ];
      const updated = {
        id: '1',
        name: 'Updated',
        host: 'localhost',
        port: 27017,
        isConnected: false,
        createdAt: '',
        updatedAt: '',
      };
      mockedApi.updateConnection.mockResolvedValue(updated);

      await appStore.updateConnection('1', { name: 'Updated' });

      expect(appStore.connections[0].name).toBe('Updated');
    });

    it('deleteConnection removes connection from store', async () => {
      appStore.connections = [
        {
          id: '1',
          name: 'Test',
          host: 'localhost',
          port: 27017,
          isConnected: false,
          createdAt: '',
          updatedAt: '',
        },
      ];
      mockedApi.deleteConnection.mockResolvedValue(undefined);

      await appStore.deleteConnection('1');

      expect(appStore.connections).toHaveLength(0);
    });

    it('connect sets connection as active and loads databases', async () => {
      appStore.connections = [
        {
          id: '1',
          name: 'Test',
          host: 'localhost',
          port: 27017,
          isConnected: false,
          createdAt: '',
          updatedAt: '',
        },
      ];
      const connected = {
        id: '1',
        name: 'Test',
        host: 'localhost',
        port: 27017,
        isConnected: true,
        createdAt: '',
        updatedAt: '',
      };
      mockedApi.connectToConnection.mockResolvedValue(connected);
      mockedApi.getDatabases.mockResolvedValue([{ name: 'test', sizeOnDisk: 1024, empty: false }]);

      await appStore.connect('1');

      expect(appStore.connections[0].isConnected).toBe(true);
      expect(appStore.activeConnectionId).toBe('1');
      expect(appStore.databases).toHaveLength(1);
    });

    it('allows creating tabs immediately after connecting', async () => {
      // Regression test: TabBar should be shown and enabled after connecting
      // This test verifies the state that the UI depends on
      appStore.connections = [
        {
          id: '1',
          name: 'Test',
          host: 'localhost',
          port: 27017,
          isConnected: false,
          createdAt: '',
          updatedAt: '',
        },
      ];
      const connected = {
        id: '1',
        name: 'Test',
        host: 'localhost',
        port: 27017,
        isConnected: true,
        createdAt: '',
        updatedAt: '',
      };
      mockedApi.connectToConnection.mockResolvedValue(connected);
      mockedApi.getDatabases.mockResolvedValue([
        { name: 'admin', sizeOnDisk: 1024, empty: false },
        { name: 'mydb', sizeOnDisk: 2048, empty: false },
      ]);

      await appStore.connect('1');

      // Verify all conditions needed for TabBar to be visible and enabled
      expect(appStore.activeConnection).toBeDefined();
      expect(appStore.activeConnection?.isConnected).toBe(true);
      expect(appStore.databases.length).toBeGreaterThan(0);

      // Verify we can create a tab using the first database
      const tab = appStore.createTab('1', appStore.databases[0].name);
      expect(tab).toBeDefined();
      expect(tab.connectionId).toBe('1');
      expect(tab.database).toBe('admin');
      expect(appStore.tabs).toHaveLength(1);
      expect(appStore.activeTab).toEqual(tab);
    });

    it('disconnect updates connection state', async () => {
      appStore.connections = [
        {
          id: '1',
          name: 'Test',
          host: 'localhost',
          port: 27017,
          isConnected: true,
          createdAt: '',
          updatedAt: '',
        },
      ];
      appStore.activeConnectionId = '1';
      const disconnected = {
        id: '1',
        name: 'Test',
        host: 'localhost',
        port: 27017,
        isConnected: false,
        createdAt: '',
        updatedAt: '',
      };
      mockedApi.disconnectFromConnection.mockResolvedValue(disconnected);

      await appStore.disconnect('1');

      expect(appStore.connections[0].isConnected).toBe(false);
      expect(appStore.activeConnectionId).toBe(null);
    });
  });

  describe('tabs', () => {
    it('createTab adds new tab and sets it active', () => {
      const tab = appStore.createTab('conn-1', 'testdb');

      expect(appStore.tabs).toHaveLength(1);
      expect(appStore.tabs[0]).toEqual(tab);
      expect(appStore.activeTabId).toBe(tab.id);
      expect(tab.connectionId).toBe('conn-1');
      expect(tab.database).toBe('testdb');
    });

    it('closeTab removes tab and selects adjacent', () => {
      const tab1 = appStore.createTab('conn-1', 'db');
      const tab2 = appStore.createTab('conn-1', 'db');
      appStore.setActiveTab(tab1.id);

      appStore.closeTab(tab1.id);

      expect(appStore.tabs).toHaveLength(1);
      expect(appStore.activeTabId).toBe(tab2.id);
    });

    it('closeTab sets null when last tab closed', () => {
      const tab = appStore.createTab('conn-1', 'db');

      appStore.closeTab(tab.id);

      expect(appStore.tabs).toHaveLength(0);
      expect(appStore.activeTabId).toBe(null);
    });

    it('setActiveTab updates activeTabId', () => {
      const tab1 = appStore.createTab('conn-1', 'db');
      const tab2 = appStore.createTab('conn-1', 'db');

      appStore.setActiveTab(tab1.id);

      expect(appStore.activeTabId).toBe(tab1.id);

      appStore.setActiveTab(tab2.id);

      expect(appStore.activeTabId).toBe(tab2.id);
    });

    it('updateTab modifies tab properties', () => {
      const tab = appStore.createTab('conn-1', 'db');

      appStore.updateTab(tab.id, { title: 'Updated Title', queryText: 'db.test.find()' });

      expect(appStore.tabs[0].title).toBe('Updated Title');
      expect(appStore.tabs[0].queryText).toBe('db.test.find()');
    });
  });

  describe('derived state', () => {
    it('activeConnection returns current connection', () => {
      appStore.connections = [
        {
          id: '1',
          name: 'Test',
          host: 'localhost',
          port: 27017,
          isConnected: true,
          createdAt: '',
          updatedAt: '',
        },
      ];
      appStore.activeConnectionId = '1';

      expect(appStore.activeConnection?.name).toBe('Test');
    });

    it('activeTab returns current tab', () => {
      const tab = appStore.createTab('conn-1', 'db');

      expect(appStore.activeTab).toEqual(tab);
    });

    it('connectedConnections filters connected only', () => {
      appStore.connections = [
        {
          id: '1',
          name: 'Connected',
          host: 'localhost',
          port: 27017,
          isConnected: true,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: '2',
          name: 'Disconnected',
          host: 'localhost',
          port: 27017,
          isConnected: false,
          createdAt: '',
          updatedAt: '',
        },
      ];

      expect(appStore.connectedConnections).toHaveLength(1);
      expect(appStore.connectedConnections[0].name).toBe('Connected');
    });
  });

  describe('UI', () => {
    it('toggleSidebar toggles sidebarOpen', () => {
      appStore.ui = { sidebarOpen: true, theme: 'light' };

      appStore.toggleSidebar();

      expect(appStore.ui.sidebarOpen).toBe(false);

      appStore.toggleSidebar();

      expect(appStore.ui.sidebarOpen).toBe(true);
    });

    it('setTheme updates theme', () => {
      appStore.setTheme('dark');

      expect(appStore.ui.theme).toBe('dark');
    });
  });

  describe('notifications', () => {
    it('notify adds notification', () => {
      appStore.notify('success', 'Test message');

      expect(appStore.notifications).toHaveLength(1);
      expect(appStore.notifications[0].type).toBe('success');
      expect(appStore.notifications[0].message).toBe('Test message');
    });

    it('dismiss removes notification', () => {
      appStore.notify('info', 'Test', 0); // duration 0 to prevent auto-dismiss
      const id = appStore.notifications[0].id;

      appStore.dismiss(id);

      expect(appStore.notifications).toHaveLength(0);
    });
  });
});
