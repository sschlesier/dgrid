import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the API module before importing the store
vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    isConnected?: boolean;
    constructor(
      public statusCode: number,
      public errorType: string,
      message: string
    ) {
      super(message);
    }
  },
  ConnectCancelledError: class ConnectCancelledError extends Error {
    constructor() {
      super('Connection was cancelled');
    }
  },
  getConnections: vi.fn(),
  createConnection: vi.fn(),
  updateConnection: vi.fn(),
  deleteConnection: vi.fn(),
  connectToConnection: vi.fn(),
  cancelConnectToConnection: vi.fn(),
  disconnectFromConnection: vi.fn(),
  getDatabases: vi.fn(),
  getCollections: vi.fn(),
  getCollectionsFast: vi.fn(),
  getAllCollectionStats: vi.fn(),
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
  cancelConnectToConnection: ReturnType<typeof vi.fn>;
  disconnectFromConnection: ReturnType<typeof vi.fn>;
  getDatabases: ReturnType<typeof vi.fn>;
  getCollections: ReturnType<typeof vi.fn>;
  getCollectionsFast: ReturnType<typeof vi.fn>;
  getAllCollectionStats: ReturnType<typeof vi.fn>;
};

describe('appStore', () => {
  beforeEach(() => {
    // Reset store state
    appStore.connections = [];
    appStore.activeConnectionId = null;
    appStore.databases = new Map();
    appStore.collections = new Map();
    appStore.tabs = [];
    appStore.activeTabId = null;
    appStore.notifications = [];
    appStore.isConnecting = false;
    appStore.slowOperation = {
      visible: false,
      targetName: '',
      cancelling: false,
    };

    // Reset mocks
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('connections', () => {
    it('loadConnections fetches and stores connections', async () => {
      const connections = [
        { id: '1', name: 'Test', uri: 'mongodb://localhost:27017', isConnected: false },
      ];
      mockedApi.getConnections.mockResolvedValue(connections);

      await appStore.loadConnections();

      expect(appStore.connections).toEqual(connections);
      expect(appStore.isLoadingConnections).toBe(false);
    });

    it('createConnection adds connection to store', async () => {
      const newConnection = { name: 'New', uri: 'mongodb://localhost:27017' };
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
          uri: 'mongodb://localhost:27017',
          savePassword: true,
          isConnected: false,
          createdAt: '',
          updatedAt: '',
        },
      ];
      const updated = {
        id: '1',
        name: 'Updated',
        uri: 'mongodb://localhost:27017',
        savePassword: true,
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
          uri: 'mongodb://localhost:27017',
          savePassword: true,
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
          uri: 'mongodb://localhost:27017',
          savePassword: true,
          isConnected: false,
          createdAt: '',
          updatedAt: '',
        },
      ];
      const connected = {
        id: '1',
        name: 'Test',
        uri: 'mongodb://localhost:27017',
        savePassword: true,
        isConnected: true,
        createdAt: '',
        updatedAt: '',
      };
      mockedApi.connectToConnection.mockResolvedValue(connected);
      mockedApi.getDatabases.mockResolvedValue([{ name: 'test', sizeOnDisk: 1024, empty: false }]);

      await appStore.connect('1');

      expect(appStore.connections[0].isConnected).toBe(true);
      expect(appStore.activeConnectionId).toBe('1');
      expect(appStore.databases.get('1')).toHaveLength(1);
    });

    it('shows the connection modal only after the delay for slow connects', async () => {
      vi.useFakeTimers();
      appStore.connections = [
        {
          id: '1',
          name: 'Slow Test',
          uri: 'mongodb://localhost:27017',
          savePassword: true,
          isConnected: false,
          createdAt: '',
          updatedAt: '',
        },
      ];
      const connected = {
        ...appStore.connections[0],
        isConnected: true,
      };
      mockedApi.connectToConnection.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(connected), 1500);
          })
      );
      mockedApi.getDatabases.mockResolvedValue([]);

      const connectPromise = appStore.connect('1');

      await vi.advanceTimersByTimeAsync(999);
      expect(appStore.slowOperation.visible).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(appStore.slowOperation.visible).toBe(true);
      expect(appStore.slowOperation.targetName).toBe('Slow Test');

      await vi.advanceTimersByTimeAsync(500);
      await connectPromise;

      expect(appStore.slowOperation.visible).toBe(false);
    });

    it('cancelSlowOperation cancels the attempt without showing an error or success', async () => {
      vi.useFakeTimers();
      appStore.connections = [
        {
          id: '1',
          name: 'Blocked Test',
          uri: 'mongodb://localhost:27017',
          savePassword: true,
          isConnected: false,
          createdAt: '',
          updatedAt: '',
        },
      ];
      mockedApi.connectToConnection.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Connection was cancelled')), 1500);
          })
      );
      mockedApi.cancelConnectToConnection.mockResolvedValue(undefined);

      const connectPromise = appStore.connect('1');
      await vi.advanceTimersByTimeAsync(1000);

      const cancelPromise = appStore.cancelSlowOperation();
      expect(appStore.slowOperation.cancelling).toBe(true);

      await cancelPromise;
      await vi.advanceTimersByTimeAsync(500);
      await connectPromise;

      expect(mockedApi.cancelConnectToConnection).toHaveBeenCalledWith('1');
      expect(appStore.notifications).toHaveLength(0);
      expect(appStore.connections[0].isConnected).toBe(false);
      expect(appStore.slowOperation.visible).toBe(false);
      expect(appStore.isConnecting).toBe(false);
    });

    it('disconnects immediately if connect resolves after the user cancelled', async () => {
      vi.useFakeTimers();
      appStore.connections = [
        {
          id: '1',
          name: 'Racy Test',
          uri: 'mongodb://localhost:27017',
          savePassword: true,
          isConnected: false,
          createdAt: '',
          updatedAt: '',
        },
      ];
      const connected = {
        ...appStore.connections[0],
        isConnected: true,
      };
      mockedApi.connectToConnection.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(connected), 25);
          })
      );
      mockedApi.cancelConnectToConnection.mockResolvedValue(undefined);
      mockedApi.disconnectFromConnection.mockResolvedValue({
        ...connected,
        isConnected: false,
      });

      const connectPromise = appStore.connect('1');
      const cancelPromise = appStore.cancelSlowOperation();

      await cancelPromise;
      await vi.advanceTimersByTimeAsync(25);
      await connectPromise;

      expect(mockedApi.disconnectFromConnection).toHaveBeenCalledWith('1');
      expect(appStore.notifications).toHaveLength(0);
      expect(appStore.connections[0].isConnected).toBe(false);
    });

    it('allows creating tabs immediately after connecting', async () => {
      // Regression test: TabBar should be shown and enabled after connecting
      // This test verifies the state that the UI depends on
      appStore.connections = [
        {
          id: '1',
          name: 'Test',
          uri: 'mongodb://localhost:27017',
          savePassword: true,
          isConnected: false,
          createdAt: '',
          updatedAt: '',
        },
      ];
      const connected = {
        id: '1',
        name: 'Test',
        uri: 'mongodb://localhost:27017',
        savePassword: true,
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
      expect(appStore.databases.get('1')?.length).toBeGreaterThan(0);

      // Verify we can create a tab using the first database
      const tab = appStore.createTab('1', appStore.databases.get('1')![0].name);
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
          uri: 'mongodb://localhost:27017',
          savePassword: true,
          isConnected: true,
          createdAt: '',
          updatedAt: '',
        },
      ];
      appStore.activeConnectionId = '1';
      const disconnected = {
        id: '1',
        name: 'Test',
        uri: 'mongodb://localhost:27017',
        savePassword: true,
        isConnected: false,
        createdAt: '',
        updatedAt: '',
      };
      mockedApi.disconnectFromConnection.mockResolvedValue(disconnected);

      await appStore.disconnect('1');

      expect(appStore.connections[0].isConnected).toBe(false);
      expect(appStore.activeConnectionId).toBe(null);
    });

    it('disconnect closes only tabs for the disconnected connection', async () => {
      appStore.connections = [
        {
          id: '1',
          name: 'Conn 1',
          uri: 'mongodb://localhost:27017',
          savePassword: true,
          isConnected: true,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: '2',
          name: 'Conn 2',
          uri: 'mongodb://localhost:27018',
          savePassword: true,
          isConnected: true,
          createdAt: '',
          updatedAt: '',
        },
      ];
      const firstTab = appStore.createTab('1', 'db1');
      const secondTab = appStore.createTab('2', 'db2');
      appStore.setActiveTab(firstTab.id);

      mockedApi.disconnectFromConnection.mockResolvedValue({
        ...appStore.connections[0],
        isConnected: false,
      });

      await appStore.disconnect('1');

      expect(appStore.tabs).toHaveLength(1);
      expect(appStore.tabs[0].id).toBe(secondTab.id);
      expect(appStore.activeTabId).toBe(secondTab.id);
      expect(appStore.activeConnectionId).toBe('2');
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
      appStore.connections = [
        {
          id: 'conn-1',
          name: 'Conn 1',
          uri: 'mongodb://localhost:27017',
          savePassword: true,
          isConnected: true,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'conn-2',
          name: 'Conn 2',
          uri: 'mongodb://localhost:27018',
          savePassword: true,
          isConnected: true,
          createdAt: '',
          updatedAt: '',
        },
      ];
      const tab1 = appStore.createTab('conn-1', 'db');
      const tab2 = appStore.createTab('conn-2', 'db');

      appStore.setActiveTab(tab1.id);

      expect(appStore.activeTabId).toBe(tab1.id);
      expect(appStore.activeConnectionId).toBe('conn-1');

      appStore.setActiveTab(tab2.id);

      expect(appStore.activeTabId).toBe(tab2.id);
      expect(appStore.activeConnectionId).toBe('conn-2');
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
          uri: 'mongodb://localhost:27017',
          savePassword: true,
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
          uri: 'mongodb://localhost:27017',
          savePassword: true,
          isConnected: true,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: '2',
          name: 'Disconnected',
          uri: 'mongodb://localhost:27017',
          savePassword: true,
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
      appStore.ui = { sidebarOpen: true, theme: 'light', treeExpanded: {}, selectedTreeNode: null };

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

  describe('database and collection scoping', () => {
    const conn1 = {
      id: 'conn-1',
      name: 'Server A',
      uri: 'mongodb://localhost:27017',
      savePassword: true,
      isConnected: true,
      createdAt: '',
      updatedAt: '',
    };
    const conn2 = {
      id: 'conn-2',
      name: 'Server B',
      uri: 'mongodb://localhost:27018',
      savePassword: true,
      isConnected: true,
      createdAt: '',
      updatedAt: '',
    };

    it('keeps databases scoped per connection when both share the same db names', async () => {
      appStore.connections = [conn1, conn2];
      mockedApi.getDatabases.mockImplementation((id: string) =>
        Promise.resolve(
          id === 'conn-1'
            ? [{ name: 'admin', sizeOnDisk: 1024, empty: false }]
            : [
                { name: 'admin', sizeOnDisk: 2048, empty: false },
                { name: 'prod', sizeOnDisk: 4096, empty: false },
              ]
        )
      );

      await appStore.loadDatabases('conn-1');
      await appStore.loadDatabases('conn-2');

      const conn1Dbs = appStore.databases.get('conn-1');
      const conn2Dbs = appStore.databases.get('conn-2');

      expect(conn1Dbs).toHaveLength(1);
      expect(conn1Dbs![0].name).toBe('admin');
      expect(conn2Dbs).toHaveLength(2);
      expect(conn2Dbs!.map((d) => d.name)).toEqual(['admin', 'prod']);
    });

    it('keeps collections scoped per connection when both share the same database name', async () => {
      appStore.connections = [conn1, conn2];
      mockedApi.getCollectionsFast.mockImplementation((connectionId: string) =>
        Promise.resolve(
          connectionId === 'conn-1'
            ? [
                {
                  name: 'users',
                  type: 'collection',
                  documentCount: 0,
                  avgDocumentSize: 0,
                  totalSize: 0,
                },
              ]
            : [
                {
                  name: 'audit_logs',
                  type: 'collection',
                  documentCount: 0,
                  avgDocumentSize: 0,
                  totalSize: 0,
                },
              ]
        )
      );

      await appStore.loadCollections('conn-1', 'admin');
      await appStore.loadCollections('conn-2', 'admin');

      const conn1Collections = appStore.collections.get(appStore.collectionKey('conn-1', 'admin'));
      const conn2Collections = appStore.collections.get(appStore.collectionKey('conn-2', 'admin'));

      expect(conn1Collections).toHaveLength(1);
      expect(conn1Collections![0].name).toBe('users');
      expect(conn2Collections).toHaveLength(1);
      expect(conn2Collections![0].name).toBe('audit_logs');
    });

    it("disconnecting one connection leaves the other connection's databases and collections intact", async () => {
      appStore.connections = [conn1, conn2];
      appStore.activeConnectionId = 'conn-1';
      appStore.databases = new Map([
        ['conn-1', [{ name: 'admin', sizeOnDisk: 1024, empty: false }]],
        ['conn-2', [{ name: 'admin', sizeOnDisk: 2048, empty: false }]],
      ]);
      appStore.collections = new Map([
        [
          appStore.collectionKey('conn-1', 'admin'),
          [
            {
              name: 'users',
              type: 'collection',
              documentCount: 0,
              avgDocumentSize: 0,
              totalSize: 0,
            },
          ],
        ],
        [
          appStore.collectionKey('conn-2', 'admin'),
          [
            {
              name: 'logs',
              type: 'collection',
              documentCount: 0,
              avgDocumentSize: 0,
              totalSize: 0,
            },
          ],
        ],
      ]);
      mockedApi.disconnectFromConnection.mockResolvedValue({ ...conn1, isConnected: false });

      await appStore.disconnect('conn-1');

      expect(appStore.databases.has('conn-1')).toBe(false);
      expect(appStore.databases.has('conn-2')).toBe(true);
      expect(appStore.collections.has(appStore.collectionKey('conn-1', 'admin'))).toBe(false);
      expect(appStore.collections.has(appStore.collectionKey('conn-2', 'admin'))).toBe(true);
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
