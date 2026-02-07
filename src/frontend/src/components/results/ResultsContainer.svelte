<script lang="ts">
  import type { ExecuteQueryResponse } from '../../../../shared/contracts';
  import { gridStore } from '../../stores/grid.svelte';
  import type { ViewMode } from '../grid/types';
  import { ResultsGrid } from '../grid';
  import { JsonView } from './json';
  import { TreeView } from './tree';
  import ViewSelector from './ViewSelector.svelte';
  import { generateCsv } from '../../lib/csv';
  import { saveCsvFile } from '../../lib/file-access';

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

  const viewMode = $derived(gridStore.getViewMode(tabId));

  function handleViewChange(mode: ViewMode) {
    gridStore.setViewMode(tabId, mode);
  }

  async function handleExportCsv() {
    const csv = generateCsv(results.documents);
    const suggestedName = `${collection}.csv`;
    try {
      await saveCsvFile(csv, suggestedName);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      throw err;
    }
  }
</script>

<div class="results-container">
  <div class="results-toolbar">
    <ViewSelector value={viewMode} onchange={handleViewChange} />
    {#if results.documents.length > 0}
      <button class="export-csv-btn" onclick={handleExportCsv}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"
          />
          <path
            d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06Z"
          />
        </svg>
        <span>Export CSV</span>
      </button>
    {/if}
  </div>

  <div class="results-content">
    {#if viewMode === 'table'}
      <ResultsGrid
        {tabId}
        {results}
        {connectionId}
        {database}
        {collection}
        {onpagechange}
        {onpagesizechange}
      />
    {:else if viewMode === 'json'}
      <JsonView {tabId} {results} {onpagechange} {onpagesizechange} />
    {:else if viewMode === 'tree'}
      <TreeView
        {tabId}
        {results}
        {connectionId}
        {database}
        {collection}
        {onpagechange}
        {onpagesizechange}
      />
    {/if}
  </div>
</div>

<style>
  .results-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
  }

  .results-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
  }

  .export-csv-btn {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .export-csv-btn:hover {
    color: var(--color-text-primary);
    background-color: var(--color-bg-hover);
  }

  .results-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
  }
</style>
