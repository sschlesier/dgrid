<script lang="ts">
  import type { GridColumn, SortDirection } from './types';

  interface Props {
    columns: GridColumn[];
    sortColumn: string | null;
    sortDirection: SortDirection;
    onsort?: (_column: string) => void;
    onresize?: (_column: string, _width: number) => void;
  }

  let { columns, sortColumn, sortDirection, onsort, onresize }: Props = $props();

  let resizing = $state<{ column: string; startX: number; startWidth: number } | null>(null);

  function handleSort(column: GridColumn) {
    if (column.sortable !== false && onsort) {
      onsort(column.key);
    }
  }

  function handleResizeStart(event: MouseEvent, column: GridColumn) {
    event.preventDefault();
    event.stopPropagation();

    resizing = {
      column: column.key,
      startX: event.clientX,
      startWidth: column.width,
    };

    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
  }

  function handleResizeMove(event: MouseEvent) {
    if (!resizing || !onresize) return;

    const diff = event.clientX - resizing.startX;
    const newWidth = Math.max(60, Math.min(600, resizing.startWidth + diff));
    onresize(resizing.column, newWidth);
  }

  function handleResizeEnd() {
    resizing = null;
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);
  }
</script>

<div class="grid-header">
  {#each columns as column (column.key)}
    <div
      class="header-cell"
      class:sortable={column.sortable !== false}
      class:sorted={sortColumn === column.key}
      style="width: {column.width}px; min-width: {column.width}px; max-width: {column.width}px;"
    >
      <button
        class="header-content"
        onclick={() => handleSort(column)}
        disabled={column.sortable === false}
      >
        <span class="header-label">{column.label}</span>

        {#if sortColumn === column.key && sortDirection}
          <span class="sort-indicator">
            {#if sortDirection === 'asc'}
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 4l4 5H4l4-5z" />
              </svg>
            {:else}
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 12l-4-5h8l-4 5z" />
              </svg>
            {/if}
          </span>
        {/if}
      </button>

      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="resize-handle"
        class:resizing={resizing?.column === column.key}
        onmousedown={(e) => handleResizeStart(e, column)}
        role="separator"
        aria-orientation="vertical"
      ></div>
    </div>
  {/each}
</div>

<style>
  .grid-header {
    display: flex;
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: var(--color-bg-secondary);
    border-bottom: 2px solid var(--color-border-medium);
    min-width: fit-content;
  }

  .header-cell {
    display: flex;
    align-items: center;
    position: relative;
    height: 36px;
    border-right: 1px solid var(--color-border-light);
  }

  .header-content {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 0 var(--space-sm);
    height: 100%;
    background: none;
    border: none;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    text-align: left;
    cursor: default;
    overflow: hidden;
  }

  .sortable .header-content {
    cursor: pointer;
  }

  .sortable .header-content:hover {
    background-color: var(--color-bg-hover);
  }

  .sorted .header-content {
    color: var(--color-primary);
  }

  .header-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sort-indicator {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    color: var(--color-primary);
  }

  .resize-handle {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    background: transparent;
  }

  .resize-handle:hover,
  .resize-handle.resizing {
    background-color: var(--color-primary);
  }
</style>
