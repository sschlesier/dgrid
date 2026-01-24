<script lang="ts">
  import type { Tab } from '../types';
  import { appStore } from '../stores/app.svelte';
  import { queryStore } from '../stores/query.svelte';
  import { editorStore } from '../stores/editor.svelte';
  import { watchFile } from '../api/websocket';
  import * as api from '../api/client';
  import Editor from './Editor.svelte';
  import QueryHistory from './QueryHistory.svelte';
  import FileDialog from './FileDialog.svelte';

  interface Props {
    tab: Tab;
  }

  let { tab }: Props = $props();

  // Local state bound to store
  let queryText = $derived(queryStore.getQueryText(tab.id) || tab.queryText);
  let results = $derived(queryStore.getResults(tab.id));
  let isExecuting = $derived(queryStore.getIsExecuting(tab.id));
  let error = $derived(queryStore.getError(tab.id));

  // UI state
  let showHistory = $state(false);
  let fileDialogMode = $state<'save' | 'load' | null>(null);
  let currentFilePath = $state<string | null>(null);
  let fileError = $state<string | null>(null);
  let unwatchFile = $state<(() => void) | null>(null);

  function handleQueryChange(value: string) {
    queryStore.setQueryText(tab.id, value);
    // Update tab title based on query
    const firstLine = value.split('\n')[0].slice(0, 30);
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

  function formatDocument(doc: Record<string, unknown>): string {
    return JSON.stringify(doc, null, 2);
  }

  // History handlers
  function openHistory() {
    showHistory = true;
  }

  function closeHistory() {
    showHistory = false;
  }

  function selectHistoryItem(item: { query: string }) {
    queryStore.setQueryText(tab.id, item.query);
    showHistory = false;
  }

  function clearHistory() {
    queryStore.clearHistory();
  }

  // File dialog handlers
  function openLoadDialog() {
    fileDialogMode = 'load';
    fileError = null;
  }

  function openSaveDialog() {
    fileDialogMode = 'save';
    fileError = null;
  }

  function closeFileDialog() {
    fileDialogMode = null;
    fileError = null;
  }

  async function handleFileLoad(path: string) {
    try {
      const result = await api.readFile(path);
      queryStore.setQueryText(tab.id, result.content);
      editorStore.addRecentPath(path);
      currentFilePath = path;
      fileDialogMode = null;
      fileError = null;

      // Start watching the file
      startWatching(path);
    } catch (e) {
      fileError = (e as Error).message;
    }
  }

  async function handleFileSave(path: string) {
    try {
      const content = queryStore.getQueryText(tab.id);
      await api.writeFile({ path, content });
      editorStore.addRecentPath(path);
      currentFilePath = path;
      fileDialogMode = null;
      fileError = null;

      // Start watching the file
      startWatching(path);
    } catch (e) {
      fileError = (e as Error).message;
    }
  }

  function startWatching(path: string) {
    // Stop watching previous file
    if (unwatchFile) {
      unwatchFile();
      unwatchFile = null;
    }

    // Watch new file
    unwatchFile = watchFile(path, (content) => {
      // Update editor content when file changes externally
      const currentContent = queryStore.getQueryText(tab.id);
      if (content !== currentContent) {
        queryStore.setQueryText(tab.id, content);
      }
    });
  }

  // Cleanup on component destroy
  $effect(() => {
    return () => {
      if (unwatchFile) {
        unwatchFile();
      }
    };
  });
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

      <div class="toolbar-divider"></div>

      <button class="toolbar-btn" onclick={openHistory} title="Query History">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M8 3.5a4.5 4.5 0 1 0 4.5 4.5.75.75 0 0 1 1.5 0 6 6 0 1 1-6-6 .75.75 0 0 1 0 1.5Z"
          />
          <path
            d="M8 6.75a.75.75 0 0 1 .75.75v2.69l1.72 1.72a.75.75 0 1 1-1.06 1.06l-2-2A.75.75 0 0 1 7.25 10V7.5A.75.75 0 0 1 8 6.75Z"
          />
          <path
            d="M10.97 1.22a.75.75 0 0 1 1.06 0l2.75 2.75a.75.75 0 0 1-1.06 1.06L11 2.28 8.28 5.03a.75.75 0 0 1-1.06-1.06l2.75-2.75Z"
          />
        </svg>
        <span>History</span>
      </button>

      <button class="toolbar-btn" onclick={openLoadDialog} title="Load from File">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M3.5 3.75a.25.25 0 0 1 .25-.25h5a.75.75 0 0 0 0-1.5h-5A1.75 1.75 0 0 0 2 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 12.25v-6.5a.75.75 0 0 0-1.5 0v6.5a.25.25 0 0 1-.25.25h-8.5a.25.25 0 0 1-.25-.25v-8.5Z"
          />
          <path
            d="M13.78 1.22a.75.75 0 0 1 0 1.06L8.06 8l1.72 1.72a.75.75 0 1 1-1.06 1.06l-2.25-2.25a.75.75 0 0 1 0-1.06l5.25-5.25a.75.75 0 0 1 1.06 0Z"
          />
        </svg>
        <span>Load</span>
      </button>

      <button class="toolbar-btn" onclick={openSaveDialog} title="Save to File">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"
          />
        </svg>
        <span>Save</span>
      </button>

      <div class="toolbar-divider"></div>

      <button
        class="toolbar-btn"
        class:active={editorStore.vimMode}
        onclick={() => editorStore.toggleVimMode()}
        title="Toggle Vim Mode"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M4.708 5.578L2.061 8.224l2.647 2.646.708-.708-1.939-1.938 1.939-1.938-.708-.708zm6.584 0l-.708.708 1.939 1.938-1.939 1.938.708.708 2.647-2.646-2.647-2.646zM7.042 11.678l1.683-7.356h1.233l-1.683 7.356H7.042z"
          />
        </svg>
        <span>Vim</span>
      </button>

      <div class="toolbar-spacer"></div>

      {#if currentFilePath}
        <span class="toolbar-file" title={currentFilePath}>
          {currentFilePath.split('/').pop()}
        </span>
      {/if}

      <span class="toolbar-info">Database: {tab.database}</span>
    </div>

    <Editor
      value={queryText}
      onchange={handleQueryChange}
      onexecute={handleExecute}
      vimMode={editorStore.vimMode}
      placeholder="Enter your MongoDB query here... (e.g., db.collection.find())"
    />
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

{#if showHistory}
  <QueryHistory
    history={queryStore.history}
    onselect={selectHistoryItem}
    onclear={clearHistory}
    onclose={closeHistory}
  />
{/if}

{#if fileDialogMode}
  <FileDialog
    mode={fileDialogMode}
    initialPath={currentFilePath ?? ''}
    apiError={fileError}
    onconfirm={fileDialogMode === 'load' ? handleFileLoad : handleFileSave}
    oncancel={closeFileDialog}
  />
{/if}

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
    gap: var(--space-sm);
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

  .toolbar-divider {
    width: 1px;
    height: 20px;
    background-color: var(--color-border-light);
  }

  .toolbar-btn {
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
  }

  .toolbar-btn:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .toolbar-btn.active {
    background-color: var(--color-primary-light);
    color: var(--color-primary);
  }

  .toolbar-spacer {
    flex: 1;
  }

  .toolbar-file {
    padding: var(--space-xs) var(--space-sm);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    background-color: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toolbar-info {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
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
