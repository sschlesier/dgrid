<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { appStore } from '../stores/app.svelte';
  import TreeNode from './TreeNode.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import CollectionTooltip from './CollectionTooltip.svelte';
  import type { TreeNodeData } from '../types';

  interface Props {
    onEditConnection: (_id: string) => void;
    onConnect: (_id: string) => Promise<void>;
  }

  let { onEditConnection, onConnect }: Props = $props();
  let filterOpen = $state(false);
  let filterText = $state('');
  let filterInputEl = $state<HTMLInputElement | undefined>();

  function normalizeFilterQuery(query: string): string {
    return query.trim().toLocaleLowerCase();
  }

  function filterTree(nodes: TreeNodeData[], query: string): TreeNodeData[] {
    const normalizedQuery = normalizeFilterQuery(query);

    if (!normalizedQuery) {
      return nodes;
    }

    function filterNode(node: TreeNodeData): TreeNodeData | null {
      switch (node.type) {
        case 'collection':
        case 'view':
          return node.label.toLocaleLowerCase().includes(normalizedQuery) ? node : null;
        case 'connection':
        case 'database':
        case 'collection-group':
        case 'view-group': {
          const filteredChildren = node.children
            ?.map(filterNode)
            .filter((child): child is TreeNodeData => child !== null);

          if (!filteredChildren?.length) {
            return null;
          }

          const filteredNode: TreeNodeData = {
            ...node,
            children: filteredChildren,
          };

          if (node.type === 'collection-group' || node.type === 'view-group') {
            filteredNode.count = filteredChildren.length;
            filteredNode.totalCount =
              node.count ?? node.children?.length ?? filteredChildren.length;
          }

          return filteredNode;
        }
        default:
          return null;
      }
    }

    return nodes.map(filterNode).filter((node): node is TreeNodeData => node !== null);
  }

  const filterActive = $derived(normalizeFilterQuery(filterText).length > 0);
  const filteredTreeData = $derived(filterTree(appStore.treeData, filterText));

  function clearFilter() {
    filterText = '';
  }

  function closeFilter() {
    filterOpen = false;
    filterText = '';
  }

  async function toggleFilter() {
    if (filterOpen) {
      closeFilter();
      return;
    }

    filterOpen = true;
    await tick();
    filterInputEl?.focus();
  }

  function handleFilterKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;

    event.preventDefault();

    if (filterText) {
      clearFilter();
      return;
    }

    closeFilter();
  }

  $effect(() => {
    if (!filterOpen) return;

    tick().then(() => {
      filterInputEl?.focus();
    });
  });

  async function handleNodeClick(node: TreeNodeData) {
    tooltip = null;
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
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

  // --- Tooltip ---

  interface TooltipState {
    x: number;
    y: number;
    node: TreeNodeData;
  }

  let tooltip = $state<TooltipState | null>(null);
  let tooltipTimer: ReturnType<typeof setTimeout> | null = null;

  function handleNodeHover(node: TreeNodeData | null, event: MouseEvent) {
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
    if (!node || (node.type !== 'collection' && node.type !== 'view')) {
      tooltip = null;
      return;
    }
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    tooltipTimer = setTimeout(() => {
      tooltip = { x: rect.right + 8, y: rect.top, node };
      tooltipTimer = null;
    }, 400);
  }

  const tooltipStats = $derived(() => {
    if (!tooltip) return null;
    const { node } = tooltip;
    if (!node.databaseName || !node.collectionName) return null;
    const colls = appStore.collections.get(node.databaseName);
    return colls?.find((c) => c.name === node.collectionName) ?? null;
  });

  onDestroy(() => {
    if (tooltipTimer) clearTimeout(tooltipTimer);
  });

  // --- Context menu ---

  interface ContextMenuState {
    x: number;
    y: number;
    node: TreeNodeData;
  }

  let contextMenu = $state<ContextMenuState | null>(null);

  function handleNodeContextMenu(node: TreeNodeData, event: MouseEvent) {
    tooltip = null;
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
    contextMenu = { x: event.clientX, y: event.clientY, node };
  }

  function getContextMenuItems(node: TreeNodeData) {
    const items: {
      label: string;
      onclick: () => void;
      destructive?: boolean;
      separator?: boolean;
    }[] = [];

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
    <button
      class="filter-toggle action-btn"
      onclick={toggleFilter}
      title={filterOpen ? 'Hide collection filter' : 'Filter collections'}
      aria-label={filterOpen ? 'Hide collection filter' : 'Filter collections'}
      aria-pressed={filterOpen}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path
          d="M6.75 2.5a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5ZM1 6.75a5.75 5.75 0 1 1 10.173 3.652l3.212 3.213a.75.75 0 1 1-1.06 1.06l-3.213-3.212A5.75 5.75 0 0 1 1 6.75Z"
        />
      </svg>
    </button>
  </div>

  {#if filterOpen}
    <div class="sidebar-filter">
      <div class="filter-input-wrap">
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          class="filter-icon"
          aria-hidden="true"
        >
          <path
            d="M6.75 2.5a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5ZM1 6.75a5.75 5.75 0 1 1 10.173 3.652l3.212 3.213a.75.75 0 1 1-1.06 1.06l-3.213-3.212A5.75 5.75 0 0 1 1 6.75Z"
          />
        </svg>
        <input
          bind:this={filterInputEl}
          bind:value={filterText}
          type="text"
          placeholder="Filter collections..."
          onkeydown={handleFilterKeyDown}
          aria-label="Filter collections"
        />
        {#if filterText}
          <button
            class="filter-clear"
            onclick={clearFilter}
            title="Clear filter"
            aria-label="Clear filter"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path
                d="M3.22 3.22a.75.75 0 0 1 1.06 0L8 6.94l3.72-3.72a.75.75 0 1 1 1.06 1.06L9.06 8l3.72 3.72a.75.75 0 1 1-1.06 1.06L8 9.06l-3.72 3.72a.75.75 0 1 1-1.06-1.06L6.94 8 3.22 4.28a.75.75 0 0 1 0-1.06Z"
              />
            </svg>
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <div class="sidebar-content" role="tree" onscroll={() => (tooltip = null)}>
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
    {:else if filterActive && filteredTreeData.length === 0}
      <div class="empty-state empty-state-filtered">
        <p class="empty-title">No matches</p>
        <p class="empty-hint">Try a different collection or view name</p>
      </div>
    {:else}
      {#each filteredTreeData as node (node.id)}
        <div class="connection-tree-item">
          <TreeNode
            {node}
            {filterActive}
            onNodeClick={handleNodeClick}
            onNodeExpand={handleNodeExpand}
            onRefresh={handleNodeRefresh}
            onNodeContextMenu={handleNodeContextMenu}
            onNodeHover={handleNodeHover}
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
    <button
      class="version-link"
      onclick={() =>
        openUrl(
          `https://github.com/sschlesier/dgrid/releases/tag/v${typeof DGRID_VERSION !== 'undefined' ? DGRID_VERSION : 'dev'}`
        )}
    >
      v{typeof DGRID_VERSION !== 'undefined' ? DGRID_VERSION : 'dev'}
    </button>
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

{#if tooltip}
  {@const stats = tooltipStats()}
  <CollectionTooltip
    x={tooltip.x}
    y={tooltip.y}
    name={tooltip.node.collectionName ?? tooltip.node.label}
    type={tooltip.node.type === 'view' ? 'view' : 'collection'}
    documentCount={stats?.documentCount ?? 0}
    avgDocumentSize={stats?.avgDocumentSize ?? 0}
    totalSize={stats?.totalSize ?? 0}
    statsLoaded={stats !== null && stats.totalSize > 0}
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .sidebar-header h2 {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .sidebar-filter {
    padding: var(--space-xs) var(--space-sm);
    border-bottom: 1px solid var(--color-border-light);
  }

  .filter-input-wrap {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    min-height: 28px;
    padding: 0 var(--space-xs);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-sm);
  }

  .filter-icon {
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .sidebar-filter input {
    flex: 1;
    min-width: 0;
    height: 28px;
    border: 0;
    background: transparent;
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }

  .sidebar-filter input:focus {
    outline: none;
  }

  .sidebar-filter input::placeholder {
    color: var(--color-text-muted);
  }

  .filter-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    color: var(--color-text-muted);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .filter-clear:hover {
    color: var(--color-text-primary);
    background-color: var(--color-bg-tertiary);
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

  .filter-toggle {
    flex-shrink: 0;
  }

  .version-link {
    all: unset;
    cursor: pointer;
    color: inherit;
  }

  .version-link:hover {
    text-decoration: underline;
  }
</style>
