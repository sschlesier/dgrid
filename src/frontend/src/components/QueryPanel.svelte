<script lang="ts">
  import type { Tab } from '../types';
  import { appStore } from '../stores/app.svelte';
  import { queryStore } from '../stores/query.svelte';

  interface Props {
    tab: Tab;
  }

  let { tab }: Props = $props();

  // Local state bound to store
  let queryText = $derived(queryStore.getQueryText(tab.id) || tab.queryText);
  let results = $derived(queryStore.getResults(tab.id));
  let isExecuting = $derived(queryStore.getIsExecuting(tab.id));
  let error = $derived(queryStore.getError(tab.id));

  function handleQueryChange(event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    queryStore.setQueryText(tab.id, textarea.value);
    // Also update tab title based on query
    const firstLine = textarea.value.split('\n')[0].slice(0, 30);
    if (firstLine) {
      appStore.updateTab(tab.id, { title: firstLine || 'New Query' });
    }
  }

  async function handleExecute() {
    const query = queryStore.getQueryText(tab.id);
    if (!query.trim()) return;

    await queryStore.executeQuery(tab.id, tab.connectionId, tab.database, query);
  }

  async function handlePageChange(newPage: number) {
    const query = queryStore.getQueryText(tab.id);
    await queryStore.loadPage(tab.id, tab.connectionId, tab.database, query, newPage);
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Cmd/Ctrl + Enter to execute
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleExecute();
    }
  }

  function formatDocument(doc: Record<string, unknown>): string {
    return JSON.stringify(doc, null, 2);
  }
</script>

<div class="query-panel">
  <div class="editor-section">
    <div class="toolbar">
      <button
        class="execute-btn"
        onclick={handleExecute}
        disabled={isExecuting || !queryText.trim()}
      >
        {#if isExecuting}
          Executing...
        {:else}
          Execute (⌘↵)
        {/if}
      </button>
      <span class="toolbar-info">Database: {tab.database}</span>
    </div>

    <textarea
      class="query-editor"
      value={queryText}
      oninput={handleQueryChange}
      onkeydown={handleKeyDown}
      placeholder="Enter your MongoDB query here... (e.g., db.collection.find())"
      spellcheck="false"
    ></textarea>
  </div>

  <div class="results-section">
    {#if error}
      <div class="error-display">
        <h3>Error</h3>
        <pre>{error}</pre>
      </div>
    {:else if isExecuting}
      <div class="loading-display">
        <span>Executing query...</span>
      </div>
    {:else if results}
      <div class="results-header">
        <span class="results-count">
          {results.totalCount} document{results.totalCount !== 1 ? 's' : ''}
        </span>
        {#if results.totalCount > results.pageSize}
          <div class="pagination">
            <button
              onclick={() => results && handlePageChange(results.page - 1)}
              disabled={results.page === 1}
            >
              Previous
            </button>
            <span>
              Page {results.page} of {Math.ceil(results.totalCount / results.pageSize)}
            </span>
            <button
              onclick={() => results && handlePageChange(results.page + 1)}
              disabled={!results.hasMore}
            >
              Next
            </button>
          </div>
        {/if}
      </div>

      <div class="results-content">
        {#each results.documents as doc, index (index)}
          <div class="document">
            <div class="document-header">
              Document {(results.page - 1) * results.pageSize + index + 1}
            </div>
            <pre class="document-content">{formatDocument(doc)}</pre>
          </div>
        {/each}

        {#if results.documents.length === 0}
          <div class="no-results">No documents found</div>
        {/if}
      </div>
    {:else}
      <div class="empty-results">
        <p>Execute a query to see results</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .query-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
  }

  .editor-section {
    display: flex;
    flex-direction: column;
    height: 200px;
    min-height: 100px;
    border-bottom: 1px solid var(--color-border-light);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
  }

  .execute-btn {
    padding: var(--space-xs) var(--space-md);
    background-color: var(--color-primary);
    color: var(--color-primary-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    border-radius: var(--radius-md);
    transition: background-color var(--transition-fast);
  }

  .execute-btn:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
  }

  .execute-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .toolbar-info {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .query-editor {
    flex: 1;
    padding: var(--space-md);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-relaxed);
    background-color: var(--color-bg-primary);
    border: none;
    resize: none;
  }

  .query-editor:focus {
    outline: none;
  }

  .query-editor::placeholder {
    color: var(--color-text-muted);
  }

  .results-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
  }

  .results-count {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .pagination {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-sm);
  }

  .pagination button {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
  }

  .pagination button:hover:not(:disabled) {
    background-color: var(--color-bg-hover);
  }

  .pagination button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .results-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
  }

  .document {
    margin-bottom: var(--space-md);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .document-header {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-secondary);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border-light);
  }

  .document-content {
    padding: var(--space-sm);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-normal);
    background-color: var(--color-bg-primary);
    overflow-x: auto;
    margin: 0;
  }

  .error-display {
    padding: var(--space-md);
    background-color: var(--color-error-light);
    color: var(--color-error-text);
  }

  .error-display h3 {
    margin-bottom: var(--space-sm);
    font-size: var(--font-size-md);
  }

  .error-display pre {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    white-space: pre-wrap;
    margin: 0;
  }

  .loading-display {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--color-text-secondary);
  }

  .empty-results {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--color-text-muted);
  }

  .no-results {
    text-align: center;
    padding: var(--space-xl);
    color: var(--color-text-muted);
  }
</style>
