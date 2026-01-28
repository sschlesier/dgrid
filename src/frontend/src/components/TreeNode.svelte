<script lang="ts">
  import type { TreeNodeData, TreeNodeType } from '../types';
  import { treeIcons } from './icons/TreeIcons';
  import { appStore } from '../stores/app.svelte';
  import TreeNode from './TreeNode.svelte';

  interface Props {
    node: TreeNodeData;
    depth?: number;
    onNodeClick?: (_node: TreeNodeData) => void;
    onNodeExpand?: (_node: TreeNodeData) => void;
    onRefresh?: (_node: TreeNodeData) => void;
  }

  let { node, depth = 0, onNodeClick, onNodeExpand, onRefresh }: Props = $props();

  // Node types that support refresh action
  const supportsRefresh = $derived(node.type === 'database' || node.type === 'collection-group');

  const hasChildren = $derived(node.children && node.children.length > 0);
  const isExpanded = $derived(appStore.isTreeNodeExpanded(node.id));
  const isSelected = $derived(appStore.ui.selectedTreeNode === node.id);

  function getIconForType(type: TreeNodeType): string {
    switch (type) {
      case 'connection':
        return treeIcons.server;
      case 'database':
        return treeIcons.database;
      case 'collection-group':
      case 'view-group':
      case 'index-group':
        return treeIcons.folder;
      case 'collection':
        return treeIcons.collection;
      case 'view':
        return treeIcons.view;
      case 'index':
        return treeIcons.index;
      default:
        return treeIcons.folder;
    }
  }

  function handleClick(event: MouseEvent) {
    event.stopPropagation();
    appStore.selectTreeNode(node.id);
    onNodeClick?.(node);
  }

  function handleExpandClick(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
    const wasExpanded = isExpanded;
    appStore.toggleTreeNode(node.id);
    if (!wasExpanded) {
      onNodeExpand?.(node);
    }
  }

  function handleChevronKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleExpandClick(event);
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick(event as unknown as MouseEvent);
    } else if (event.key === 'ArrowRight' && hasChildren && !isExpanded) {
      event.preventDefault();
      appStore.toggleTreeNode(node.id);
      onNodeExpand?.(node);
    } else if (event.key === 'ArrowLeft' && isExpanded) {
      event.preventDefault();
      appStore.toggleTreeNode(node.id);
    }
  }

  function handleRefresh(event: MouseEvent) {
    event.stopPropagation();
    onRefresh?.(node);
  }

  const nodeIcon = $derived(getIconForType(node.type));
  const chevronIcon = $derived(isExpanded ? treeIcons.chevronDown : treeIcons.chevronRight);
  const indentStyle = $derived(`padding-left: ${depth * 16 + 4}px`);
  const isConnected = $derived(
    node.type === 'connection' &&
      node.connectionId &&
      appStore.connections.find((c) => c.id === node.connectionId)?.isConnected
  );
</script>

<div class="tree-node" class:selected={isSelected}>
  <div class="tree-node-row">
    <div
      class="tree-node-content"
      style={indentStyle}
      onclick={handleClick}
      onkeydown={handleKeyDown}
      role="treeitem"
      tabindex="0"
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-selected={isSelected}
    >
      <!-- Expand/collapse chevron -->
      <span
        class="chevron"
        class:invisible={!hasChildren}
        class:loading={node.isLoading}
        onclick={handleExpandClick}
        onkeydown={handleChevronKeyDown}
        role="button"
        tabindex="-1"
      >
        {#if node.isLoading}
          <svg width="16" height="16" viewBox="0 0 16 16" class="spin">
            {@html treeIcons.loading}
          </svg>
        {:else}
          <svg width="16" height="16" viewBox="0 0 16 16">
            {@html chevronIcon}
          </svg>
        {/if}
      </span>

      <!-- Type icon -->
      <span class="node-icon" class:connected={isConnected}>
        <svg width="16" height="16" viewBox="0 0 16 16">
          {@html nodeIcon}
        </svg>
      </span>

      <!-- Label -->
      <span class="node-label">{node.label}</span>

      <!-- Count badge -->
      {#if node.count !== undefined}
        <span class="node-count">({node.count})</span>
      {/if}
    </div>

    <!-- Refresh button for supported node types (outside the main clickable area) -->
    {#if supportsRefresh && onRefresh}
      <button class="refresh-btn" onclick={handleRefresh} title="Refresh">
        <svg width="14" height="14" viewBox="0 0 16 16">
          {@html treeIcons.refresh}
        </svg>
      </button>
    {/if}
  </div>

  <!-- Children (recursive) -->
  {#if hasChildren && isExpanded}
    <div class="tree-children" role="group">
      {#each node.children as child (child.id)}
        <TreeNode node={child} depth={depth + 1} {onNodeClick} {onNodeExpand} {onRefresh} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .tree-node {
    user-select: none;
  }

  .tree-node-row {
    display: flex;
    align-items: center;
    position: relative;
  }

  .tree-node-content {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex: 1;
    min-width: 0;
    height: var(--tree-node-height);
    padding-right: var(--space-sm);
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .tree-node-content:hover {
    background-color: var(--color-bg-hover);
  }

  .tree-node.selected > .tree-node-row > .tree-node-content {
    background-color: var(--color-bg-active);
  }

  .chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--tree-icon-size);
    height: var(--tree-icon-size);
    flex-shrink: 0;
    color: var(--color-text-muted);
    border-radius: var(--radius-sm);
    transition: color var(--transition-fast);
  }

  .chevron:hover:not(.invisible) {
    color: var(--color-text-primary);
    background-color: var(--color-bg-tertiary);
  }

  .chevron.invisible {
    visibility: hidden;
  }

  .chevron.loading svg {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .node-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--tree-icon-size);
    height: var(--tree-icon-size);
    flex-shrink: 0;
    color: var(--color-text-secondary);
  }

  .node-icon.connected {
    color: var(--color-connected);
  }

  .node-label {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .node-count {
    flex-shrink: 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .tree-children {
    /* Children are indented via padding-left in the node content */
  }

  .refresh-btn {
    position: absolute;
    right: var(--space-xs);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    color: var(--color-text-muted);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .refresh-btn:hover {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }
</style>
