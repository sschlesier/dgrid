<script lang="ts">
  import type { ExecuteQueryResponse } from '../../lib/contracts';
  import { gridStore } from '../../stores/grid.svelte';
  import { exportStore, type ExportMode } from '../../stores/export.svelte';
  import type { ViewMode } from '../grid/types';
  import { ResultsGrid } from '../grid';
  import { JsonView } from './json';
  import { TreeView } from './tree';
  import ViewSelector from './ViewSelector.svelte';
  import ExportOverlay from './ExportOverlay.svelte';

  interface Props {
    tabId: string;
    results: ExecuteQueryResponse;
    connectionId: string;
    database: string;
    collection: string;
    query: string;
    onpagechange?: (_page: number) => void;
    onpagesizechange?: (_size: 50 | 100 | 250 | 500) => void;
  }

  let {
    tabId,
    results,
    connectionId,
    database,
    collection,
    query,
    onpagechange,
    onpagesizechange,
  }: Props = $props();

  const viewMode = $derived(gridStore.getViewMode(tabId));
  const expState = $derived(exportStore.getState(tabId));
  const exportMode = $derived(exportStore.mode);

  let dropdownOpen = $state(false);

  function handleViewChange(mode: ViewMode) {
    gridStore.setViewMode(tabId, mode);
  }

  async function handleExportFile() {
    const suggestedName = `${collection}.csv`;
    await exportStore.startExport(tabId, connectionId, database, query, suggestedName);
  }

  async function handleExportClipboard() {
    await exportStore.exportToClipboard(connectionId, database, query);
  }

  async function handleMainExport() {
    if (exportMode === 'clipboard') {
      await handleExportClipboard();
    } else {
      await handleExportFile();
    }
  }

  function selectMode(mode: ExportMode) {
    // Only update the default — the user clicks the main button to actually export.
    exportStore.setMode(mode);
    dropdownOpen = false;
  }

  function handleCancelExport() {
    exportStore.cancelExport(tabId);
  }

  function toggleDropdown() {
    dropdownOpen = !dropdownOpen;
  }

  function closeDropdown() {
    dropdownOpen = false;
  }

  function handleDropdownKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeDropdown();
    }
  }
</script>

<div class="results-container" data-tab-id={tabId}>
  <div class="results-toolbar">
    <ViewSelector value={viewMode} onchange={handleViewChange} />
    {#if results.documents.length > 0}
      <div class="export-split-btn" class:is-exporting={expState.isExporting}>
        <!-- Main action button -->
        <button
          class="export-main-btn"
          onclick={handleMainExport}
          disabled={expState.isExporting}
          title={exportMode === 'clipboard' ? 'Copy CSV to clipboard' : 'Export to CSV file'}
        >
          {#if exportMode === 'clipboard'}
            <!-- Clipboard icon -->
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path
                d="M5.75 1a.75.75 0 0 0-.75.75v3c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-3a.75.75 0 0 0-.75-.75h-4.5Zm.75 3V2.5h3V4h-3Zm-2.874-.467a.75.75 0 0 0-.752-1.298A1.75 1.75 0 0 0 2 3.75v9.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 13.25v-9.5a1.75 1.75 0 0 0-.874-1.515.75.75 0 1 0-.752 1.298.25.25 0 0 1 .126.217v9.5a.25.25 0 0 1-.25.25h-8.5a.25.25 0 0 1-.25-.25v-9.5a.25.25 0 0 1 .126-.217Z"
              />
            </svg>
            <span>Copy CSV</span>
          {:else}
            <!-- Download icon -->
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path
                d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"
              />
              <path
                d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06Z"
              />
            </svg>
            <span>Export CSV</span>
          {/if}
        </button>

        <!-- Caret button -->
        <button
          class="export-caret-btn"
          onclick={toggleDropdown}
          disabled={expState.isExporting}
          aria-label="Choose export format"
          aria-expanded={dropdownOpen}
          aria-haspopup="menu"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
            <path
              d="M1.5 3.5L5 7l3.5-3.5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          </svg>
        </button>

        <!-- Dropdown menu -->
        {#if dropdownOpen}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="export-backdrop"
            onclick={closeDropdown}
            onkeydown={handleDropdownKeydown}
          ></div>
          <div class="export-dropdown" role="menu">
            <button
              class="export-dropdown-item"
              class:is-active={exportMode === 'file'}
              role="menuitem"
              onclick={() => selectMode('file')}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"
                />
                <path
                  d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06Z"
                />
              </svg>
              Export to CSV file
            </button>
            <button
              class="export-dropdown-item"
              class:is-active={exportMode === 'clipboard'}
              role="menuitem"
              onclick={() => selectMode('clipboard')}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M5.75 1a.75.75 0 0 0-.75.75v3c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-3a.75.75 0 0 0-.75-.75h-4.5Zm.75 3V2.5h3V4h-3Zm-2.874-.467a.75.75 0 0 0-.752-1.298A1.75 1.75 0 0 0 2 3.75v9.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 13.25v-9.5a1.75 1.75 0 0 0-.874-1.515.75.75 0 1 0-.752 1.298.25.25 0 0 1 .126.217v9.5a.25.25 0 0 1-.25.25h-8.5a.25.25 0 0 1-.25-.25v-9.5a.25.25 0 0 1 .126-.217Z"
                />
              </svg>
              Copy to clipboard
            </button>
          </div>
        {/if}
      </div>
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

    {#if expState.isExporting}
      <ExportOverlay
        exportedCount={expState.exportedCount}
        totalCount={expState.totalCount}
        oncancel={handleCancelExport}
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

  /* Split button container */
  .export-split-btn {
    position: relative;
    display: flex;
    align-items: center;
  }

  /* Main action button */
  .export-main-btn {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    background: none;
    border: none;
    border-radius: var(--radius-sm) 0 0 var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .export-main-btn:hover:not(:disabled) {
    color: var(--color-text-primary);
    background-color: var(--color-bg-hover);
  }

  .export-main-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Caret button */
  .export-caret-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xs) 4px;
    color: var(--color-text-secondary);
    background: none;
    border: none;
    border-left: 1px solid var(--color-border-light);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .export-caret-btn:hover:not(:disabled) {
    color: var(--color-text-primary);
    background-color: var(--color-bg-hover);
  }

  .export-caret-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Show divider only on hover of the container */
  .export-split-btn:hover .export-caret-btn {
    border-left-color: var(--color-border-medium);
  }

  /* Transparent full-screen backdrop to catch outside clicks */
  .export-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
  }

  /* Dropdown menu */
  .export-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 180px;
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: var(--space-xs) 0;
    z-index: 101;
  }

  .export-dropdown-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: none;
    background: none;
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color var(--transition-fast);
  }

  .export-dropdown-item:hover {
    background-color: var(--color-bg-hover);
  }

  .export-dropdown-item.is-active {
    color: var(--color-accent);
    font-weight: 500;
  }

  .results-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    position: relative;
  }
</style>
