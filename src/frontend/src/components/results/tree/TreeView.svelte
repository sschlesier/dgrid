<script lang="ts">
  import { untrack } from 'svelte';
  import type { ExecuteQueryResponse } from '../../../../../shared/contracts';
  import { searchDocument, getAncestorPaths, getAllPaths } from './tree-utils';
  import TreeField from './TreeField.svelte';
  import TreeToolbar from './TreeToolbar.svelte';
  import { GridPagination } from '../../grid';
  import { gridStore } from '../../../stores/grid.svelte';

  interface Props {
    tabId: string;
    results: ExecuteQueryResponse;
    onpagechange?: (_page: number) => void;
    onpagesizechange?: (_size: 50 | 100 | 250 | 500) => void;
  }

  let { tabId, results, onpagechange, onpagesizechange }: Props = $props();

  let searchQuery = $state('');
  let expandedPaths = $state<Set<string>>(new Set());

  const gridState = $derived(gridStore.getState(tabId));
  const docs = $derived(results.documents as Record<string, unknown>[]);

  // Search results
  const searchMatches = $derived.by(() => {
    if (!searchQuery.trim()) return new Set<string>();

    const matches: string[] = [];
    docs.forEach((doc, index) => {
      matches.push(...searchDocument(doc, searchQuery, index));
    });
    return new Set(matches);
  });

  // Auto-expand to show search matches
  // Use untrack to read expandedPaths without creating a dependency on it
  // This prevents an infinite loop where writing expandedPaths triggers the effect again
  $effect(() => {
    if (searchMatches.size > 0) {
      const ancestors = getAncestorPaths(Array.from(searchMatches));
      const currentExpanded = untrack(() => expandedPaths);
      expandedPaths = new Set([...currentExpanded, ...ancestors]);
    }
  });

  function handleSearch(query: string) {
    searchQuery = query;
  }

  function handleToggle(path: string) {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    expandedPaths = newExpanded;
  }

  function handleExpandAll() {
    const allPaths: string[] = [];
    docs.forEach((doc, index) => {
      allPaths.push(...getAllPaths(doc, index));
    });
    expandedPaths = new Set(allPaths);
  }

  function handleCollapseAll() {
    expandedPaths = new Set();
  }

  function handlePageSizeChange(size: 50 | 100 | 250 | 500) {
    gridStore.setPageSize(tabId, size);
    if (onpagesizechange) {
      onpagesizechange(size);
    }
  }
</script>

<div class="tree-view">
  <div class="tree-header">
    <TreeToolbar
      {searchQuery}
      matchCount={searchMatches.size}
      onsearch={handleSearch}
      onexpandall={handleExpandAll}
      oncollapseall={handleCollapseAll}
    />
  </div>

  {#if docs.length === 0}
    <div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" class="empty-icon">
        <path
          d="M2.5 1.75a.25.25 0 0 1 .25-.25h8.5a.25.25 0 0 1 .25.25v7.5a.25.25 0 0 1-.25.25h-8.5a.25.25 0 0 1-.25-.25Zm.25-1.75A1.75 1.75 0 0 0 1 1.75v7.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 13 9.25v-7.5A1.75 1.75 0 0 0 11.25 0ZM0 12.75A1.75 1.75 0 0 0 1.75 14.5h8.5A1.75 1.75 0 0 0 12 12.75v-.5a.75.75 0 0 0-1.5 0v.5a.25.25 0 0 1-.25.25h-8.5a.25.25 0 0 1-.25-.25v-.5a.75.75 0 0 0-1.5 0Z"
        />
      </svg>
      <p class="empty-title">No documents found</p>
      <p class="empty-hint">Your query returned no results</p>
    </div>
  {:else}
    <div class="tree-content">
      {#each docs as doc, docIndex (docIndex)}
        <div class="document-tree">
          <div class="document-header">
            <span class="document-label">Document {docIndex + 1}</span>
          </div>
          <div class="document-fields">
            {#each Object.entries(doc) as [key, value] (key)}
              <TreeField
                fieldKey={key}
                {value}
                {docIndex}
                path={[key]}
                depth={0}
                {expandedPaths}
                {searchMatches}
                ontoggle={handleToggle}
              />
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <GridPagination
    totalCount={results.totalCount}
    page={results.page}
    pageSize={gridState.pageSize}
    hasMore={results.hasMore}
    {onpagechange}
    onpagesizechange={handlePageSizeChange}
  />
</div>

<style>
  .tree-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    background-color: var(--color-bg-primary);
  }

  .tree-header {
    display: flex;
    align-items: center;
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
  }

  .tree-content {
    flex: 1;
    overflow: auto;
    padding: var(--space-md);
  }

  .document-tree {
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-md);
    overflow: hidden;
    margin-bottom: var(--space-md);
    background-color: var(--color-bg-primary);
  }

  .document-tree:last-child {
    margin-bottom: 0;
  }

  .document-header {
    display: flex;
    align-items: center;
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
  }

  .document-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
  }

  .document-fields {
    padding: var(--space-xs) 0;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    flex: 1;
    color: var(--color-text-muted);
  }

  .empty-icon {
    opacity: 0.3;
    margin-bottom: var(--space-xs);
  }

  .empty-title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
  }

  .empty-hint {
    font-size: var(--font-size-sm);
    opacity: 0.7;
  }
</style>
