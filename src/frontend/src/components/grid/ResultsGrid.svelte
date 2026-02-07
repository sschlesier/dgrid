<script lang="ts">
  import { untrack } from 'svelte';
  import type { ExecuteQueryResponse } from '../../../../shared/contracts';
  import { gridStore } from '../../stores/grid.svelte';
  import {
    detectColumns,
    flattenArrayData,
    expandArrayAsColumns,
    isArrayOfObjects,
    sortDocuments,
    getNestedValue,
    isSerializedBson,
    detectCellType,
  } from './utils';
  import type { DrilldownDocument, GridColumn } from './types';
  import GridHeader from './GridHeader.svelte';
  import GridRow from './GridRow.svelte';
  import GridBreadcrumb from './GridBreadcrumb.svelte';
  import GridPagination from './GridPagination.svelte';
  import EditFieldDialog from '../EditFieldDialog.svelte';

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
        // For arrays of objects, flatten into rows (one row per array element)
        // For arrays of primitives, expand into columns (one column per array index)
        if (isArrayOfObjects(nestedValue)) {
          return flattenArrayData(docs, drilldownPath);
        } else {
          return expandArrayAsColumns(docs, drilldownPath);
        }
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
          _id: docId, // Always include parent document's _id (after spread to override any nested _id)
        };
      }

      return {
        _docId: docId,
        _docIndex: index,
        _id: docId, // Always include parent document's _id
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
      // Filter out internal columns from display (but keep _id which comes from _docId)
      const visibleColumns = detectedColumns.filter(
        (col) => !col.key.startsWith('_doc') && col.key !== '_arrayIndex'
      );

      // Use untrack to prevent infinite loop - writing to store shouldn't trigger re-run
      untrack(() => {
        // Only update if columns changed (compare keys)
        const currentColumns = gridStore.getColumns(tabId);
        const columnsChanged =
          visibleColumns.length !== currentColumns.length ||
          visibleColumns.some((col, i) => col.key !== currentColumns[i]?.key);

        if (columnsChanged) {
          gridStore.setColumns(tabId, visibleColumns);
        }
      });
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

  function handleEdit(doc: Record<string, unknown>, fieldKey: string, value: unknown) {
    const fullPath = drilldownPath.length > 0 ? [...drilldownPath, fieldKey].join('.') : fieldKey;
    const docId = doc._docId ?? doc._id;
    const docIndex = typeof doc._docIndex === 'number' ? doc._docIndex : 0;
    editingField = {
      docId,
      docIndex,
      fieldPath: fullPath,
      value,
      cellType: detectCellType(value) as string,
    };
  }

  function handleEditSaved(fieldPath: string, newValue: unknown) {
    // Update in-memory document
    if (editingField) {
      const docs = results.documents as Record<string, unknown>[];
      const doc = docs[editingField.docIndex];
      if (doc) {
        const parts = fieldPath.split('.');
        let current: Record<string, unknown> = doc;
        for (let i = 0; i < parts.length - 1; i++) {
          const next = current[parts[i]];
          if (next && typeof next === 'object' && !Array.isArray(next)) {
            current = next as Record<string, unknown>;
          } else {
            break;
          }
        }
        current[parts[parts.length - 1]] = newValue;
      }
    }
    editingField = null;
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
              onedit={(fieldKey, value) => handleEdit(doc, fieldKey, value)}
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

{#if editingField}
  <EditFieldDialog
    field={{
      connectionId,
      database,
      collection,
      docId: editingField.docId,
      fieldPath: editingField.fieldPath,
      value: editingField.value,
      cellType: detectCellType(editingField.value),
    }}
    onclose={() => (editingField = null)}
    onsaved={handleEditSaved}
  />
{/if}

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
