<script lang="ts">
  import { untrack } from 'svelte';
  import type { ExecuteQueryResponse } from '../../../../../shared/contracts';
  import { searchDocument, getAncestorPaths, getAllPaths, getDocumentSummary } from './tree-utils';
  import { detectValueType } from './tree-utils';
  import TreeField from './TreeField.svelte';
  import TypeIcon from './TypeIcon.svelte';
  import TreeToolbar from './TreeToolbar.svelte';
  import { GridPagination } from '../../grid';
  import { gridStore } from '../../../stores/grid.svelte';
  import { queryStore } from '../../../stores/query.svelte';
  import EditFieldDialog from '../../EditFieldDialog.svelte';

  interface Props {
    tabId: string;
    results: ExecuteQueryResponse;
    connectionId: string;
    database: string;
    collection: string;
    onpagechange?: (_page: number) => void;
    onpagesizechange?: (_size: 50 | 100 | 250 | 500) => void;
  }

  let {
    tabId,
    results,
    connectionId,
    database,
    collection,
    onpagechange,
    onpagesizechange,
  }: Props = $props();

  // Edit state
  interface EditingField {
    docId: unknown;
    docIndex: number;
    fieldPath: string;
    value: unknown;
    cellType: string;
  }

  let editingField = $state<EditingField | null>(null);

  let searchQuery = $state('');
  let expandedPaths = $state<Set<string>>(new Set());
  let currentMatchIndex = $state(0);

  const gridState = $derived(gridStore.getState(tabId));
  const docs = $derived(results.documents as Record<string, unknown>[]);

  // Search results - keep as array for navigation, derive Set for highlighting
  const searchMatchList = $derived.by(() => {
    if (!searchQuery.trim()) return [];

    const matches: string[] = [];
    docs.forEach((doc, index) => {
      matches.push(...searchDocument(doc, searchQuery, index));
    });
    return matches;
  });

  const searchMatches = $derived(new Set(searchMatchList));

  // Reset current match index when search changes
  $effect(() => {
    // Access searchQuery to create dependency
    searchQuery;
    currentMatchIndex = 0;
  });

  // Auto-expand to show search matches
  // Use untrack to read expandedPaths without creating a dependency on it
  // This prevents an infinite loop where writing expandedPaths triggers the effect again
  $effect(() => {
    if (searchMatches.size > 0) {
      const ancestors = getAncestorPaths(Array.from(searchMatches));
      const currentExpanded = untrack(() => expandedPaths);
      // Also expand the document rows that contain matches
      const docIndices = new Set<string>();
      for (const match of searchMatches) {
        const docIndex = match.split('.')[0];
        docIndices.add(`doc:${docIndex}`);
      }
      expandedPaths = new Set([...currentExpanded, ...ancestors, ...docIndices]);
    }
  });

  function handleSearch(query: string) {
    searchQuery = query;
  }

  function handleNextMatch() {
    if (searchMatchList.length === 0) return;
    currentMatchIndex = (currentMatchIndex + 1) % searchMatchList.length;
    scrollToCurrentMatch();
  }

  function handlePrevMatch() {
    if (searchMatchList.length === 0) return;
    currentMatchIndex = (currentMatchIndex - 1 + searchMatchList.length) % searchMatchList.length;
    scrollToCurrentMatch();
  }

  function scrollToCurrentMatch() {
    if (searchMatchList.length === 0) return;
    const matchPath = searchMatchList[currentMatchIndex];
    // Find the element by data-path attribute and scroll to it
    requestAnimationFrame(() => {
      const element = document.querySelector(`[data-path="${matchPath}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
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

  function handleDocToggle(docIndex: number) {
    const docPath = `doc:${docIndex}`;
    handleToggle(docPath);
  }

  function isDocExpanded(docIndex: number): boolean {
    return expandedPaths.has(`doc:${docIndex}`);
  }

  function handleExpandAll() {
    const allPaths: string[] = [];
    // Add all document paths
    docs.forEach((doc, index) => {
      allPaths.push(`doc:${index}`);
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

  function handleDocKeydown(event: KeyboardEvent, docIndex: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleDocToggle(docIndex);
    } else if (event.key === 'ArrowRight' && !isDocExpanded(docIndex)) {
      event.preventDefault();
      handleDocToggle(docIndex);
    } else if (event.key === 'ArrowLeft' && isDocExpanded(docIndex)) {
      event.preventDefault();
      handleDocToggle(docIndex);
    }
  }

  function handleFieldEdit(docIndex: number, fieldPath: string, value: unknown) {
    const doc = docs[docIndex];
    if (!doc) return;
    const docId = doc._id;
    editingField = {
      docId,
      docIndex,
      fieldPath,
      value,
      cellType: detectValueType(value),
    };
  }

  async function handleEditSaved() {
    editingField = null;
    // Re-execute the query at the current page to reload fresh data
    const query = queryStore.getQueryText(tabId);
    const pageSize = gridStore.getPageSize(tabId);
    await queryStore.loadPage(tabId, connectionId, database, query, results.page, pageSize);
  }
</script>

<div class="tree-view">
  <div class="tree-toolbar">
    <TreeToolbar
      {searchQuery}
      matchCount={searchMatchList.length}
      {currentMatchIndex}
      onsearch={handleSearch}
      onnextmatch={handleNextMatch}
      onprevmatch={handlePrevMatch}
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
      <div class="tree-table">
        <!-- Header row -->
        <div class="tree-header-cell">Key</div>
        <div class="tree-header-cell">Value</div>
        <div class="tree-header-cell">Type</div>

        {#each docs as doc, docIndex (docIndex)}
          {@const summary = getDocumentSummary(doc, docIndex)}
          {@const docExpanded = isDocExpanded(docIndex)}

          <!-- Document row -->
          <div
            class="tree-row document-row"
            class:expanded={docExpanded}
            role="button"
            tabindex="0"
            onclick={() => handleDocToggle(docIndex)}
            onkeydown={(e) => handleDocKeydown(e, docIndex)}
          >
            <!-- Key cell: document summary -->
            <div class="key-cell" style="padding-left: var(--space-sm)">
              <span class="field-chevron">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path
                    d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"
                  />
                </svg>
              </span>
              <TypeIcon type="Object" />
              <span class="doc-label">{summary.label}</span>
              <span class="doc-id">
                <span class="id-prefix">{'{_id : '}</span>
                <span class="id-value">{summary.idDisplay}</span>
                <span class="id-suffix">{'}'}</span>
              </span>
            </div>

            <!-- Value cell: field count -->
            <div class="value-cell">
              <span class="field-count">{'{ '}{summary.fieldCount} fields{' }'}</span>
            </div>

            <!-- Type cell -->
            <div class="type-cell">Document</div>
          </div>

          <!-- Document fields (when expanded) -->
          {#if docExpanded}
            {#each Object.entries(doc) as [key, value] (key)}
              <TreeField
                fieldKey={key}
                {value}
                {docIndex}
                path={[key]}
                depth={1}
                {expandedPaths}
                {searchMatches}
                ontoggle={handleToggle}
                onedit={handleFieldEdit}
              />
            {/each}
          {/if}
        {/each}
      </div>
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

{#if editingField}
  <EditFieldDialog
    field={{
      connectionId,
      database,
      collection,
      docId: editingField.docId,
      fieldPath: editingField.fieldPath,
      value: editingField.value,
      cellType: detectValueType(editingField.value) as import('../../grid/types').CellType,
    }}
    onclose={() => (editingField = null)}
    onsaved={handleEditSaved}
  />
{/if}

<style>
  .tree-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    background-color: var(--color-bg-primary);
  }

  .tree-toolbar {
    display: flex;
    align-items: center;
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
  }

  .tree-content {
    flex: 1;
    overflow: auto;
    padding: var(--space-sm);
  }

  .tree-table {
    display: grid;
    grid-template-columns: var(--tree-key-column) var(--tree-value-column) var(--tree-type-column);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .tree-header-cell {
    display: flex;
    align-items: center;
    height: var(--tree-node-height);
    padding: 0 var(--space-sm);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Document row styles */
  .tree-row {
    display: contents;
  }

  .tree-row:hover > .key-cell,
  .tree-row:hover > .value-cell,
  .tree-row:hover > .type-cell {
    background-color: var(--color-bg-hover);
  }

  .tree-row:focus > .key-cell,
  .tree-row:focus > .value-cell,
  .tree-row:focus > .type-cell {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  .document-row {
    cursor: pointer;
  }

  .document-row > .key-cell,
  .document-row > .value-cell,
  .document-row > .type-cell {
    background-color: var(--color-bg-secondary);
  }

  .document-row:hover > .key-cell,
  .document-row:hover > .value-cell,
  .document-row:hover > .type-cell {
    background-color: var(--color-bg-tertiary);
  }

  .key-cell,
  .value-cell,
  .type-cell {
    display: flex;
    align-items: center;
    height: var(--tree-node-height);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    overflow: hidden;
  }

  .key-cell {
    gap: var(--space-xs);
    padding-right: var(--space-sm);
  }

  .value-cell {
    padding: 0 var(--space-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .type-cell {
    padding: 0 var(--space-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
  }

  .field-chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--tree-icon-size);
    height: var(--tree-icon-size);
    flex-shrink: 0;
    color: var(--color-text-muted);
    transition: transform var(--transition-fast);
  }

  .tree-row.expanded .field-chevron {
    transform: rotate(90deg);
  }

  .doc-label {
    color: var(--color-text-muted);
    font-size: var(--font-size-xs);
    margin-right: var(--space-xs);
  }

  .doc-id {
    display: flex;
    align-items: center;
    gap: 0;
  }

  .id-prefix,
  .id-suffix {
    color: var(--color-text-muted);
  }

  .id-value {
    color: var(--color-primary);
  }

  .field-count {
    color: var(--color-primary);
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
