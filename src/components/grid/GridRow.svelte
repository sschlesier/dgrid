<script lang="ts">
  import type { GridColumn } from './types';
  import GridCell from './GridCell.svelte';

  interface Props {
    doc: Record<string, unknown>;
    columns: GridColumn[];
    offsetY: number;
    rowIndex: number;
    selected?: boolean;
    onselect?: (_event: MouseEvent, _gutter: boolean) => void;
    ondrill?: (_field: string) => void;
    onedit?: (_fieldKey: string, _value: unknown) => void;
    oneditdocument?: (_doc: Record<string, unknown>) => void;
    onrowcontextmenu?: (_event: MouseEvent) => void;
  }

  let {
    doc,
    columns,
    offsetY,
    rowIndex,
    selected = false,
    onselect,
    ondrill,
    onedit,
    oneditdocument,
    onrowcontextmenu,
  }: Props = $props();

  function handleContextMenu(event: MouseEvent) {
    if (onrowcontextmenu) {
      event.preventDefault();
      onrowcontextmenu(event);
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="grid-row"
  class:even={rowIndex % 2 === 0}
  class:selected
  aria-selected={selected}
  style="transform: translateY({offsetY}px);"
  data-row-index={rowIndex}
  oncontextmenu={handleContextMenu}
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="row-gutter"
    data-testid="row-gutter"
    onclick={(e) => onselect?.(e, true)}
    onmousedown={(e) => {
      if (e.shiftKey) e.preventDefault();
    }}
    role="presentation"
  >
    {rowIndex + 1}
  </div>
  {#each columns as column (column.key)}
    <GridCell
      value={doc[column.key]}
      width={column.width}
      fieldKey={column.key}
      {ondrill}
      onselect={onselect ? (e) => onselect(e, false) : undefined}
      {onedit}
      oneditdocument={oneditdocument ? () => oneditdocument(doc) : undefined}
    />
  {/each}
</div>

<style>
  .grid-row {
    display: flex;
    position: absolute;
    top: 0;
    left: 0;
    height: 32px;
    min-width: 100%;
  }

  .row-gutter {
    flex: 0 0 var(--grid-gutter-width, 40px);
    width: var(--grid-gutter-width, 40px);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 0 var(--space-sm);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs, 11px);
    color: var(--color-text-muted);
    border-right: 1px solid var(--color-border-light);
    cursor: pointer;
    user-select: none;
  }

  .grid-row:hover {
    background-color: var(--color-bg-hover);
  }

  .grid-row.even {
    background-color: var(--color-bg-secondary);
  }

  .grid-row.even:hover {
    background-color: var(--color-bg-hover);
  }

  .grid-row.selected,
  .grid-row.selected:hover,
  .grid-row.even.selected,
  .grid-row.even.selected:hover {
    background-color: var(--color-primary-light);
    box-shadow: inset 3px 0 0 var(--color-primary);
  }
</style>
