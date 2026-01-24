<script lang="ts">
  import { appStore } from '../stores/app.svelte';
  import TreeNode from './TreeNode.svelte';
  import type { TreeNodeData } from '../types';

  interface Props {
    onEditConnection: (_id: string) => void;
  }

  let { onEditConnection }: Props = $props();

  async function handleNodeClick(node: TreeNodeData) {
    switch (node.type) {
      case 'connection': {
        const connection = appStore.connections.find((c) => c.id === node.connectionId);
        if (connection && !connection.isConnected) {
          await appStore.connect(node.connectionId!);
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
        }
        break;
      }
    }
  }

  function handleEditConnection(event: MouseEvent, connectionId: string) {
    event.stopPropagation();
    onEditConnection(connectionId);
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <h2>Connections</h2>
  </div>

  <div class="sidebar-content" role="tree">
    {#if appStore.connections.length === 0}
      <div class="empty-state">
        <p>No connections yet</p>
      </div>
    {:else}
      {#each appStore.treeData as node (node.id)}
        <div class="connection-tree-item">
          <TreeNode {node} onNodeClick={handleNodeClick} onNodeExpand={handleNodeExpand} />
          <!-- Edit button overlay for connections -->
          {#if node.type === 'connection'}
            <button
              class="edit-btn"
              onclick={(e) => handleEditConnection(e, node.connectionId!)}
              title="Edit connection"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11.5 2.5l2 2-7 7H4.5v-2l7-7z" />
              </svg>
            </button>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</aside>

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

  .empty-state {
    padding: var(--space-xl);
    text-align: center;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }

  .connection-tree-item {
    position: relative;
  }

  .edit-btn {
    position: absolute;
    top: 6px;
    right: var(--space-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: var(--color-text-secondary);
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all var(--transition-fast);
  }

  .connection-tree-item:hover .edit-btn {
    opacity: 1;
  }

  .edit-btn:hover {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }
</style>
