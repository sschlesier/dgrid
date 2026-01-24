<script lang="ts">
  import type { ExecuteQueryResponse } from '../../../../shared/contracts';
  import { gridStore } from '../../stores/grid.svelte';
  import {
    detectColumns,
    flattenArrayData,
    sortDocuments,
    getNestedValue,
    isSerializedBson,
  } from './utils';
  import type { DrilldownDocument, GridColumn } from './types';
  import GridHeader from './GridHeader.svelte';
  import GridRow from './GridRow.svelte';
  import GridBreadcrumb from './GridBreadcrumb.svelte';
  import GridPagination from './GridPagination.svelte';

  interface Props {
    tabId: string;
    results: ExecuteQueryResponse;
    onpagechange?: (_page: number) => void;
    onpagesizechange?: (_size: 50 | 100 | 250 | 500) => void;
  }

  let { tabId, results, onpagechange, onpagesizechange }: Props = $props();

  // Virtual scroll constants
  const ROW_HEIGHT = 32;
  const BUFFER_ROWS = 5;

  // Scroll state
  let scrollContainer: HTMLDivElement | undefined = $state();
  let scrollTop = $state(0);
  let viewportHeight = $state(400);

  // Grid state from store
  const gridState = $derived(gridStore.getState(tabId));
  const columns = $derived(gridState.columns);
  const sort = $derived(gridState.sort);
  const drilldownPath = $derived(gridState.drilldown.path);

  // Compute display data based on drill-down path
  const displayData = $derived.by((): DrilldownDocument[] => {
    const docs = results.documents as Record<string, unknown>[];

    if (drilldownPath.length === 0) {
      return docs.map((doc, index) => ({ ...doc, _docIndex: index }));
    }

    // Check if we're drilling into an array
    const firstDoc = docs[0];
    if (firstDoc) {
      const nestedValue = getNestedValue(firstDoc, drilldownPath);
      if (Array.isArray(nestedValue)) {
        return flattenArrayData(docs, drilldownPath);
      }
    }

    // For non-array nested objects
    return docs.map((doc, index) => {
      const nested = getNestedValue(doc, drilldownPath);
      const docId = doc._id;

      if (nested && typeof nested === 'object' && !isSerializedBson(nested)) {
        return {
          _docId: docId,
          _docIndex: index,
          ...(nested as Record<string, unknown>),
        };
      }

      return {
        _docId: docId,
        _docIndex: index,
        value: nested,
      };
    });
  });

  // Sort data if needed
  const sortedData = $derived.by((): DrilldownDocument[] => {
    if (!sort.column || !sort.direction) {
      return displayData;
    }
    return sortDocuments(displayData, sort.column, sort.direction);
  });

  // Update columns when data changes
  $effect(() => {
    if (sortedData.length > 0) {
      const detectedColumns = detectColumns(sortedData as Record<string, unknown>[]);
      // Filter out internal columns from display
      const visibleColumns = detectedColumns.filter(
        (col) => !col.key.startsWith('_doc') && col.key !== '_arrayIndex'
      );
      gridStore.setColumns(tabId, visibleColumns);
    }
  });

  // Virtual scroll calculations
  const visibleStart = $derived(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS));
  const visibleEnd = $derived(
    Math.min(
      sortedData.length,
      visibleStart + Math.ceil(viewportHeight / ROW_HEIGHT) + BUFFER_ROWS * 2
    )
  );
  const totalHeight = $derived(sortedData.length * ROW_HEIGHT);
  const visibleRows = $derived(sortedData.slice(visibleStart, visibleEnd));

  // Total column width for horizontal scrolling
  const totalWidth = $derived(columns.reduce((sum: number, col: GridColumn) => sum + col.width, 0));

  function handleScroll(event: Event) {
    const target = event.target as HTMLDivElement;
    scrollTop = target.scrollTop;
  }

  function handleResize() {
    if (scrollContainer) {
      viewportHeight = scrollContainer.clientHeight;
    }
  }

  // Setup resize observer
  $effect(() => {
    if (scrollContainer) {
      viewportHeight = scrollContainer.clientHeight;

      const resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(scrollContainer);

      return () => resizeObserver.disconnect();
    }
  });

  // Event handlers
  function handleSort(columnKey: string) {
    gridStore.toggleSort(tabId, columnKey);
  }

  function handleColumnResize(columnKey: string, width: number) {
    gridStore.setColumnWidth(tabId, columnKey, width);
  }

  function handleDrill(field: string) {
    gridStore.drillInto(tabId, field);
    // Reset scroll position
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
      scrollTop = 0;
    }
  }

  function handleDrillBack() {
    gridStore.drillBack(tabId);
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
      scrollTop = 0;
    }
  }

  function handleDrillForward() {
    gridStore.drillForward(tabId);
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
      scrollTop = 0;
    }
  }

  function handleDrillSegment(index: number) {
    gridStore.drillToSegment(tabId, index);
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
      scrollTop = 0;
    }
  }

  function handlePageSizeChange(size: 50 | 100 | 250 | 500) {
    gridStore.setPageSize(tabId, size);
    if (onpagesizechange) {
      onpagesizechange(size);
    }
  }
</script>

<div class="results-grid">
  <GridBreadcrumb
    path={drilldownPath}
    canBack={gridStore.canDrillBack(tabId)}
    canForward={gridStore.canDrillForward(tabId)}
    onback={handleDrillBack}
    onforward={handleDrillForward}
    onsegment={handleDrillSegment}
  />

  {#if sortedData.length === 0}
    <div class="empty-state">No documents found</div>
  {:else}
    <div class="grid-viewport" bind:this={scrollContainer} onscroll={handleScroll}>
      <div class="grid-content" style="width: {Math.max(totalWidth, 100)}px;">
        <GridHeader
          {columns}
          sortColumn={sort.column}
          sortDirection={sort.direction}
          onsort={handleSort}
          onresize={handleColumnResize}
        />

        <div class="grid-body" style="height: {totalHeight}px;">
          {#each visibleRows as doc, i (visibleStart + i)}
            <GridRow
              {doc}
              {columns}
              offsetY={(visibleStart + i) * ROW_HEIGHT}
              rowIndex={visibleStart + i}
              ondrill={handleDrill}
            />
          {/each}
        </div>
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
  .results-grid {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    background-color: var(--color-bg-primary);
  }

  .grid-viewport {
    flex: 1;
    overflow: auto;
    position: relative;
  }

  .grid-content {
    min-width: 100%;
  }

  .grid-body {
    position: relative;
    min-width: 100%;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--color-text-muted);
    font-size: var(--font-size-md);
  }
</style>
