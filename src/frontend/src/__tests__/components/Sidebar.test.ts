import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Sidebar from '../../components/Sidebar.svelte';
import { createMockConnection, createMockTreeNode } from '../test-utils';

// Mock the appStore
vi.mock('../../stores/app.svelte', () => ({
  appStore: {
    connections: [],
    treeData: [],
    ui: { selectedTreeNode: null, sidebarOpen: true, theme: 'light', treeExpanded: {} },
    connect: vi.fn(),
    toggleTreeNode: vi.fn(),
    createTab: vi.fn(),
    isTreeNodeExpanded: vi.fn().mockReturnValue(false),
  },
}));

import { appStore } from '../../stores/app.svelte';

describe('Sidebar', () => {
  const mockOnEditConnection = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (appStore as { connections: unknown[]; treeData: unknown[] }).connections = [];
    (appStore as { connections: unknown[]; treeData: unknown[] }).treeData = [];
  });

  describe('empty state display', () => {
    it('shows empty message when no connections exist', () => {
      render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection },
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
        props: { onEditConnection: mockOnEditConnection },
      });

      expect(screen.queryByText('No connections yet')).not.toBeInTheDocument();
    });
  });

  describe('header', () => {
    it('displays "Connections" header', () => {
      render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection },
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
        props: { onEditConnection: mockOnEditConnection },
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
        props: { onEditConnection: mockOnEditConnection },
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
        props: { onEditConnection: mockOnEditConnection },
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
        props: { onEditConnection: mockOnEditConnection },
      });

      const editButton = screen.getByTitle('Edit connection');
      await fireEvent.click(editButton);

      expect(mockOnEditConnection).toHaveBeenCalledWith('conn-1');
    });
  });

  describe('accessibility', () => {
    it('has tree role on content container', () => {
      render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection },
      });

      expect(screen.getByRole('tree')).toBeInTheDocument();
    });
  });

  describe('structure', () => {
    it('renders sidebar with expected structure', () => {
      const { container } = render(Sidebar, {
        props: { onEditConnection: mockOnEditConnection },
      });

      expect(container.querySelector('.sidebar')).toBeInTheDocument();
      expect(container.querySelector('.sidebar-header')).toBeInTheDocument();
      expect(container.querySelector('.sidebar-content')).toBeInTheDocument();
    });
  });
});
