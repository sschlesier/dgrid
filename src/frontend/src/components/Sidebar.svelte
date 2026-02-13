<script lang="ts">
  import { appStore } from '../stores/app.svelte';
  import TreeNode from './TreeNode.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import type { TreeNodeData } from '../types';

  interface Props {
    onEditConnection: (_id: string) => void;
    onConnect: (_id: string) => Promise<void>;
  }

  let { onEditConnection, onConnect }: Props = $props();

  async function handleNodeClick(node: TreeNodeData) {
    switch (node.type) {
      case 'connection': {
        const connection = appStore.connections.find((c) => c.id === node.connectionId);
        if (connection && !connection.isConnected) {
          await onConnect(node.connectionId!);
          appStore.toggleTreeNode(node.id);
        }
        break;
      }
      case 'collection':
      case 'view': {
        if (node.connectionId && node.databaseName && node.collectionName) {
          appStore.createTab(node.connectionId, node.databaseName, node.collectionName);
        }
        break;
      }
    }
  }

  async function handleNodeExpand(node: TreeNodeData) {
    switch (node.type) {
      case 'database': {
        if (node.connectionId && node.databaseName) {
          const collections = appStore.collections.get(node.databaseName);
          if (!collections) {
            await appStore.loadCollections(node.connectionId, node.databaseName);
          }
          // Auto-expand the "Collections" group when expanding a database
          const collGroupId = `coll-group:${node.connectionId}:${node.databaseName}`;
          appStore.setTreeNodeExpanded(collGroupId, true);
        }
        break;
      }
    }
  }

  function handleEditConnection(event: MouseEvent, connectionId: string) {
    event.stopPropagation();
    onEditConnection(connectionId);
  }

  function handleDisconnect(event: MouseEvent, connectionId: string) {
    event.stopPropagation();
    appStore.disconnect(connectionId);
  }

  function handleRefreshConnection(event: MouseEvent, connectionId: string) {
    event.stopPropagation();
    appStore.refreshDatabases(connectionId);
  }

  function handleNodeRefresh(node: TreeNodeData) {
    switch (node.type) {
      case 'database':
        if (node.connectionId && node.databaseName) {
          appStore.refreshCollections(node.connectionId, node.databaseName);
        }
        break;
      case 'collection-group':
        if (node.connectionId && node.databaseName) {
          appStore.refreshCollections(node.connectionId, node.databaseName);
        }
        break;
    }
  }

  // --- Context menu ---

  interface ContextMenuState {
    x: number;
    y: number;
    node: TreeNodeData;
  }

  let contextMenu = $state<ContextMenuState | null>(null);

  function handleNodeContextMenu(node: TreeNodeData, event: MouseEvent) {
    contextMenu = { x: event.clientX, y: event.clientY, node };
  }

  function getContextMenuItems(node: TreeNodeData) {
    const items: { label: string; onclick: () => void; destructive?: boolean; separator?: boolean }[] = [];

    switch (node.type) {
      case 'connection': {
        const connection = appStore.connections.find((c) => c.id === node.connectionId);
        if (connection?.isConnected) {
          items.push({
            label: 'Refresh',
            onclick: () => {
              contextMenu = null;
              appStore.refreshDatabases(node.connectionId!);
            },
          });
          items.push({
            label: 'Edit Connection',
            onclick: () => {
              contextMenu = null;
              onEditConnection(node.connectionId!);
            },
          });
          items.push({
            label: 'Disconnect',
            onclick: () => {
              contextMenu = null;
              appStore.disconnect(node.connectionId!);
            },
          });
          items.push({
            label: 'Delete Connection',
            separator: true,
            destructive: true,
            onclick: () => {
              contextMenu = null;
              handleDeleteConnection(node.connectionId!, true);
            },
          });
        } else {
          items.push({
            label: 'Connect',
            onclick: async () => {
              contextMenu = null;
              await onConnect(node.connectionId!);
              appStore.toggleTreeNode(node.id);
            },
          });
          items.push({
            label: 'Edit Connection',
            onclick: () => {
              contextMenu = null;
              onEditConnection(node.connectionId!);
            },
          });
          items.push({
            label: 'Delete Connection',
            destructive: true,
            onclick: () => {
              contextMenu = null;
              handleDeleteConnection(node.connectionId!, false);
            },
          });
        }
        break;
      }

      case 'database':
        items.push({
          label: 'Refresh Collections',
          onclick: () => {
            contextMenu = null;
            if (node.connectionId && node.databaseName) {
              appStore.refreshCollections(node.connectionId, node.databaseName);
            }
          },
        });
        break;

      case 'collection':
      case 'view':
        items.push({
          label: 'Open in New Tab',
          onclick: () => {
            contextMenu = null;
            if (node.connectionId && node.databaseName && node.collectionName) {
              appStore.createTab(node.connectionId, node.databaseName, node.collectionName);
            }
          },
        });
        items.push({
          label: 'Copy Collection Name',
          onclick: () => {
            contextMenu = null;
            if (node.collectionName) {
              navigator.clipboard.writeText(node.collectionName);
            }
          },
        });
        break;
    }

    return items;
  }

  async function handleDeleteConnection(connectionId: string, isConnected: boolean) {
    const message = isConnected
      ? 'Disconnect and delete this connection?'
      : 'Are you sure you want to delete this connection?';

    if (!confirm(message)) return;

    if (isConnected) {
      await appStore.disconnect(connectionId);
    }
    await appStore.deleteConnection(connectionId);
  }

  const contextMenuItems = $derived(contextMenu ? getContextMenuItems(contextMenu.node) : []);
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <h2>Connections</h2>
  </div>

  <div class="sidebar-content" role="tree">
    {#if appStore.connections.length === 0}
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 16 16" fill="currentColor" class="empty-icon">
          <path
            d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7.25-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7.25 8.25v-3.5a.75.75 0 0 1 1.5 0Z"
          />
        </svg>
        <p class="empty-title">No connections yet</p>
        <p class="empty-hint">Create a new connection to get started</p>
      </div>
    {:else}
      {#each appStore.treeData as node (node.id)}
        <div class="connection-tree-item">
          <TreeNode
            {node}
            onNodeClick={handleNodeClick}
            onNodeExpand={handleNodeExpand}
            onRefresh={handleNodeRefresh}
            onNodeContextMenu={handleNodeContextMenu}
          />
          <!-- Action buttons overlay for connections -->
          {#if node.type === 'connection'}
            <div class="action-buttons">
              {#if appStore.connections.find((c) => c.id === node.connectionId)?.isConnected}
                <button
                  class="action-btn"
                  onclick={(e) => handleRefreshConnection(e, node.connectionId!)}
                  title="Refresh databases"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16">
                    <path
                      d="M13.5 8a5.5 5.5 0 1 1-1.1-3.3M13.5 2v3h-3"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      fill="none"
                    />
                  </svg>
                </button>
                <button
                  class="action-btn"
                  onclick={(e) => handleDisconnect(e, node.connectionId!)}
                  title="Disconnect"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16">
                    <path
                      d="M8 1v4M4.93 3.93L3.5 2.5M11.07 3.93l1.43-1.43M3 8a5 5 0 1 0 10 0 5 5 0 0 0-10 0"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      fill="none"
                    />
                  </svg>
                </button>
              {/if}
              <button
                class="action-btn"
                onclick={(e) => handleEditConnection(e, node.connectionId!)}
                title="Edit connection"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M11.5 2.5l2 2-7 7H4.5v-2l7-7z" />
                </svg>
              </button>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <div class="sidebar-footer">
    v{typeof DGRID_VERSION !== 'undefined' ? DGRID_VERSION : 'dev'}
  </div>
</aside>

{#if contextMenu && contextMenuItems.length > 0}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={contextMenuItems}
    onclose={() => (contextMenu = null)}
  />
{/if}

<style>
  .sidebar {
    width: var(--sidebar-width);
    background-color: var(--color-bg-secondary);
    border-right: 1px solid var(--color-border-light);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    padding: var(--space-md);
    border-bottom: 1px solid var(--color-border-light);
  }

  .sidebar-header h2 {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-sm);
  }

  .sidebar-footer {
    padding: var(--space-sm);
    border-top: 1px solid var(--color-border-light);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
    text-align: center;
    color: var(--color-text-muted);
  }

  .empty-icon {
    margin-bottom: var(--space-md);
    opacity: 0.4;
  }

  .empty-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--space-xs);
  }

  .empty-hint {
    font-size: var(--font-size-xs);
    opacity: 0.7;
  }

  .connection-tree-item {
    position: relative;
  }

  .action-buttons {
    position: absolute;
    top: 6px;
    right: var(--space-sm);
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: var(--color-text-secondary);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .action-btn:hover {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }
</style>
