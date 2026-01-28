<script lang="ts">
  import type { ExecuteQueryResponse } from '../../../../../shared/contracts';
  import type { JsonFormat } from './formatters';
  import { formatDocument, formatDocuments, loadJsonFormat, saveJsonFormat } from './formatters';
  import JsonDocument from './JsonDocument.svelte';
  import JsonToolbar from './JsonToolbar.svelte';
  import { GridPagination } from '../../grid';
  import { gridStore } from '../../../stores/grid.svelte';

  interface Props {
    tabId: string;
    results: ExecuteQueryResponse;
    onpagechange?: (_page: number) => void;
    onpagesizechange?: (_size: 50 | 100 | 250 | 500) => void;
  }

  let { tabId, results, onpagechange, onpagesizechange }: Props = $props();

  let scrollContainer: HTMLDivElement | undefined = $state();
  let format = $state<JsonFormat>(loadJsonFormat());

  const gridState = $derived(gridStore.getState(tabId));

  // Format documents for display
  const formattedDocs = $derived.by(() => {
    return results.documents.map((doc) => formatDocument(doc as Record<string, unknown>, format));
  });

  function handleFormatChange(newFormat: JsonFormat) {
    format = newFormat;
    saveJsonFormat(newFormat);
  }

  async function handleCopyAll() {
    try {
      const allContent = formatDocuments(results.documents as Record<string, unknown>[], format);
      await navigator.clipboard.writeText(allContent);
    } catch {
      // Clipboard API may fail
    }
  }

  function handlePageSizeChange(size: 50 | 100 | 250 | 500) {
    gridStore.setPageSize(tabId, size);
    if (onpagesizechange) {
      onpagesizechange(size);
    }
  }
</script>

<div class="json-view">
  <div class="json-header">
    <JsonToolbar {format} onformatchange={handleFormatChange} oncopyall={handleCopyAll} />
  </div>

  {#if results.documents.length === 0}
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
    <div class="json-content" bind:this={scrollContainer}>
      <div class="documents-list">
        {#each formattedDocs as content, index (index)}
          <JsonDocument {content} {index} />
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

<style>
  .json-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    background-color: var(--color-bg-primary);
  }

  .json-header {
    display: flex;
    align-items: center;
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
  }

  .json-content {
    flex: 1;
    overflow: auto;
    padding: var(--space-md);
  }

  .documents-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
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
