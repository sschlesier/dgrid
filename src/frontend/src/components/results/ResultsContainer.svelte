<script lang="ts">
  import type { ExecuteQueryResponse } from '../../../../shared/contracts';
  import { gridStore } from '../../stores/grid.svelte';
  import type { ViewMode } from '../grid/types';
  import { ResultsGrid } from '../grid';
  import { JsonView } from './json';
  import ViewSelector from './ViewSelector.svelte';

  interface Props {
    tabId: string;
    results: ExecuteQueryResponse;
    onpagechange?: (_page: number) => void;
    onpagesizechange?: (_size: 50 | 100 | 250 | 500) => void;
  }

  let { tabId, results, onpagechange, onpagesizechange }: Props = $props();

  const viewMode = $derived(gridStore.getViewMode(tabId));

  function handleViewChange(mode: ViewMode) {
    gridStore.setViewMode(tabId, mode);
  }
</script>

<div class="results-container">
  <div class="results-toolbar">
    <ViewSelector value={viewMode} onchange={handleViewChange} />
  </div>

  <div class="results-content">
    {#if viewMode === 'table'}
      <ResultsGrid {tabId} {results} {onpagechange} {onpagesizechange} />
    {:else if viewMode === 'json'}
      <JsonView {tabId} {results} {onpagechange} {onpagesizechange} />
    {:else if viewMode === 'tree'}
      <div class="placeholder">Tree View - Coming Soon</div>
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
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
  }

  .results-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--color-text-muted);
    font-size: var(--font-size-md);
  }
</style>
