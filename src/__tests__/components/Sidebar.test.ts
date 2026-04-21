import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Sidebar from '../../components/Sidebar.svelte';
import { createMockConnection, createMockTreeNode } from '../test-utils';

const mockOnConnect = vi.fn();

// Mock the appStore
vi.mock('../../stores/app.svelte', () => ({
  appStore: {
    connections: [],
    treeData: [],
    collections: new Map(),
    indexes: new Map(),
    ui: { selectedTreeNode: null, sidebarOpen: true, theme: 'light', treeExpanded: {} },
    connect: vi.fn(),
    disconnect: vi.fn(),
    toggleTreeNode: vi.fn(),
    setTreeNodeExpanded: vi.fn(),
    refreshDatabases: vi.fn(),
    refreshCollections: vi.fn(),
    deleteConnection: vi.fn(),
    createTab: vi.fn(),
    loadIndexes: vi.fn(),
    indexKey: vi.fn((connectionId: string, database: string, collection: string) => {
      return `${connectionId}:${database}:${collection}`;
    }),
    isTreeNodeExpanded: vi.fn().mockReturnValue(false),
  },
}));

import { appStore } from '../../stores/app.svelte';

describe('Sidebar', () => {
  const mockOnEditConnection = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (
      appStore as {
        connections: unknown[];
        treeData: unknown[];
        indexes: Map<string, unknown[]>;
        collections: Map<string, unknown[]>;
      }
    ).connections = [];
    (
      appStore as {
        connections: unknown[];
        treeData: unknown[];
        indexes: Map<string, unknown[]>;
        collections: Map<string, unknown[]>;
      }
    ).treeData = [];
    (
      appStore as {
        connections: unknown[];
        treeData: unknown[];
        indexes: Map<string, unknown[]>;
        collections: Map<string, unknown[]>;
      }
    ).indexes = new Map();
    (
      appStore as {
        connections: unknown[];
        treeData: unknown[];
        indexes: Map<string, unknown[]>;
        collections: Map<string, unknown[]>;
      }
    ).collections = new Map();
  });

  describe('empty state display', () => {
    it('shows empty message when no connections exist', () => {
      render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection, onConnect: mockOnConnect },
      });

      expect(screen.getByText('No connections yet')).toBeInTheDocument();
    });

    it('hides empty message when connections exist', () => {
      const connection = createMockConnection();
      (appStore as { connections: unknown[]; treeData: unknown[] }).connections = [connection];
      (appStore as { connections: unknown[]; treeData: unknown[] }).treeData = [
        createMockTreeNode({
          id: 'conn:conn-1',
          type: 'connection',
          label: 'Test Connection',
          connectionId: 'conn-1',
        }),
      ];

      render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection, onConnect: mockOnConnect },
      });

      expect(screen.queryByText('No connections yet')).not.toBeInTheDocument();
    });
  });

  describe('header', () => {
    it('displays "Connections" header', () => {
      render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection, onConnect: mockOnConnect },
      });

      expect(screen.getByText('Connections')).toBeInTheDocument();
    });
  });

  describe('connection tree rendering', () => {
    it('renders connection nodes', () => {
      const connection = createMockConnection({ id: 'conn-1', name: 'My Connection' });
      (appStore as { connections: unknown[]; treeData: unknown[] }).connections = [connection];
      (appStore as { connections: unknown[]; treeData: unknown[] }).treeData = [
        createMockTreeNode({
          id: 'conn:conn-1',
          type: 'connection',
          label: 'My Connection',
          connectionId: 'conn-1',
        }),
      ];

      render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection, onConnect: mockOnConnect },
      });

      expect(screen.getByText('My Connection')).toBeInTheDocument();
    });

    it('renders multiple connections', () => {
      (appStore as { connections: unknown[]; treeData: unknown[] }).connections = [
        createMockConnection({ id: 'conn-1', name: 'Connection 1' }),
        createMockConnection({ id: 'conn-2', name: 'Connection 2' }),
      ];
      (appStore as { connections: unknown[]; treeData: unknown[] }).treeData = [
        createMockTreeNode({
          id: 'conn:conn-1',
          type: 'connection',
          label: 'Connection 1',
          connectionId: 'conn-1',
        }),
        createMockTreeNode({
          id: 'conn:conn-2',
          type: 'connection',
          label: 'Connection 2',
          connectionId: 'conn-2',
        }),
      ];

      render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection, onConnect: mockOnConnect },
      });

      expect(screen.getByText('Connection 1')).toBeInTheDocument();
      expect(screen.getByText('Connection 2')).toBeInTheDocument();
    });
  });

  describe('edit button', () => {
    it('renders edit button for connection nodes', () => {
      const connection = createMockConnection({ id: 'conn-1', name: 'Test' });
      (appStore as { connections: unknown[]; treeData: unknown[] }).connections = [connection];
      (appStore as { connections: unknown[]; treeData: unknown[] }).treeData = [
        createMockTreeNode({
          id: 'conn:conn-1',
          type: 'connection',
          label: 'Test',
          connectionId: 'conn-1',
        }),
      ];

      render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection, onConnect: mockOnConnect },
      });

      expect(screen.getByTitle('Edit connection')).toBeInTheDocument();
    });

    it('calls onEditConnection when edit button is clicked', async () => {
      const connection = createMockConnection({ id: 'conn-1', name: 'Test' });
      (appStore as { connections: unknown[]; treeData: unknown[] }).connections = [connection];
      (appStore as { connections: unknown[]; treeData: unknown[] }).treeData = [
        createMockTreeNode({
          id: 'conn:conn-1',
          type: 'connection',
          label: 'Test',
          connectionId: 'conn-1',
        }),
      ];

      render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection, onConnect: mockOnConnect },
      });

      const editButton = screen.getByTitle('Edit connection');
      await fireEvent.click(editButton);

      expect(mockOnEditConnection).toHaveBeenCalledWith('conn-1');
    });
  });

  describe('accessibility', () => {
    it('has tree role on content container', () => {
      render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection, onConnect: mockOnConnect },
      });

      expect(screen.getByRole('tree')).toBeInTheDocument();
    });
  });

  describe('structure', () => {
    it('renders sidebar with expected structure', () => {
      const { container } = render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection, onConnect: mockOnConnect },
      });

      expect(container.querySelector('.sidebar')).toBeInTheDocument();
      expect(container.querySelector('.sidebar-header')).toBeInTheDocument();
      expect(container.querySelector('.sidebar-content')).toBeInTheDocument();
    });
  });

  describe('collection filter', () => {
    beforeEach(() => {
      (appStore as { connections: unknown[]; treeData: unknown[] }).connections = [
        createMockConnection({ id: 'conn-1', name: 'Primary', isConnected: true }),
      ];
      (appStore as { treeData: unknown[] }).treeData = [
        createMockTreeNode({
          id: 'conn:conn-1',
          type: 'connection',
          label: 'Primary',
          connectionId: 'conn-1',
          children: [
            createMockTreeNode({
              id: 'db:conn-1:alpha',
              type: 'database',
              label: 'alpha',
              connectionId: 'conn-1',
              databaseName: 'alpha',
              children: [
                createMockTreeNode({
                  id: 'coll-group:conn-1:alpha',
                  type: 'collection-group',
                  label: 'Collections',
                  count: 2,
                  connectionId: 'conn-1',
                  databaseName: 'alpha',
                  children: [
                    createMockTreeNode({
                      id: 'coll:conn-1:alpha:users',
                      type: 'collection',
                      label: 'users',
                      connectionId: 'conn-1',
                      databaseName: 'alpha',
                      collectionName: 'users',
                    }),
                    createMockTreeNode({
                      id: 'coll:conn-1:alpha:orders',
                      type: 'collection',
                      label: 'orders',
                      connectionId: 'conn-1',
                      databaseName: 'alpha',
                      collectionName: 'orders',
                    }),
                  ],
                }),
                createMockTreeNode({
                  id: 'view-group:conn-1:alpha',
                  type: 'view-group',
                  label: 'Views',
                  count: 1,
                  connectionId: 'conn-1',
                  databaseName: 'alpha',
                  children: [
                    createMockTreeNode({
                      id: 'view:conn-1:alpha:active_users',
                      type: 'view',
                      label: 'active_users',
                      connectionId: 'conn-1',
                      databaseName: 'alpha',
                      collectionName: 'active_users',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ];
    });

    it('opens the filter bar and focuses the input', async () => {
      render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection, onConnect: mockOnConnect },
      });

      await fireEvent.click(screen.getByRole('button', { name: 'Filter collections' }));

      const input = screen.getByPlaceholderText('Filter collections...');
      expect(input).toBeInTheDocument();
      expect(document.activeElement).toBe(input);
    });

    it('filters the tree and updates group counts', async () => {
      render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection, onConnect: mockOnConnect },
      });

      await fireEvent.click(screen.getByRole('button', { name: 'Filter collections' }));
      await fireEvent.input(screen.getByPlaceholderText('Filter collections...'), {
        target: { value: 'user' },
      });

      expect(screen.getByText('users')).toBeInTheDocument();
      expect(screen.getByText('active_users')).toBeInTheDocument();
      expect(screen.queryByText('orders')).not.toBeInTheDocument();
      expect(screen.getByText('(1 of 2)')).toBeInTheDocument();
      expect(screen.getByText('(1 of 1)')).toBeInTheDocument();
    });

    it('clears the filter with escape and hides it when already empty', async () => {
      render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection, onConnect: mockOnConnect },
      });

      await fireEvent.click(screen.getByRole('button', { name: 'Filter collections' }));
      const input = screen.getByPlaceholderText('Filter collections...');
      await fireEvent.input(input, { target: { value: 'user' } });
      await fireEvent.keyDown(input, { key: 'Escape' });

      expect((input as HTMLInputElement).value).toBe('');
      expect(screen.getByPlaceholderText('Filter collections...')).toBeInTheDocument();

      await fireEvent.keyDown(input, { key: 'Escape' });

      expect(screen.queryByPlaceholderText('Filter collections...')).not.toBeInTheDocument();
    });

    it('shows a no matches message when the filter returns no nodes', async () => {
      render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection, onConnect: mockOnConnect },
      });

      await fireEvent.click(screen.getByRole('button', { name: 'Filter collections' }));
      await fireEvent.input(screen.getByPlaceholderText('Filter collections...'), {
        target: { value: 'missing' },
      });

      expect(screen.getByText('No matches')).toBeInTheDocument();
      expect(screen.getByText('Try a different collection or view name')).toBeInTheDocument();
    });
  });

  describe('lazy index loading', () => {
    it('loads indexes when a collection expands before index children exist', async () => {
      (appStore as { connections: unknown[]; treeData: unknown[] }).connections = [
        createMockConnection({ id: 'conn-1', name: 'Primary', isConnected: true }),
      ];
      (appStore as { treeData: unknown[] }).treeData = [
        createMockTreeNode({
          id: 'coll:conn-1:alpha:users',
          type: 'collection',
          label: 'users',
          connectionId: 'conn-1',
          databaseName: 'alpha',
          collectionName: 'users',
        }),
      ];

      const { container } = render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection, onConnect: mockOnConnect },
      });

      const chevron = container.querySelector('.chevron');
      expect(chevron).toBeInTheDocument();
      expect(chevron).not.toHaveClass('invisible');

      await fireEvent.click(chevron!);

      expect(appStore.toggleTreeNode).toHaveBeenCalledWith('coll:conn-1:alpha:users');
      expect(appStore.loadIndexes).toHaveBeenCalledWith('conn-1', 'alpha', 'users');
      expect(appStore.setTreeNodeExpanded).toHaveBeenCalledWith(
        'idx-group:conn-1:alpha:users',
        true
      );
    });
  });
});
