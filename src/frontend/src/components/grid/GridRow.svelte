<script lang="ts">
  import type { GridColumn } from './types';
  import GridCell from './GridCell.svelte';

  interface Props {
    doc: Record<string, unknown>;
    columns: GridColumn[];
    offsetY: number;
    rowIndex: number;
    ondrill?: (_field: string) => void;
    onedit?: (_fieldKey: string, _value: unknown) => void;
    onrowcontextmenu?: (_event: MouseEvent) => void;
  }

  let { doc, columns, offsetY, rowIndex, ondrill, onedit, onrowcontextmenu }: Props = $props();

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
  style="transform: translateY({offsetY}px);"
  data-row-index={rowIndex}
  oncontextmenu={handleContextMenu}
>
  {#each columns as column (column.key)}
    <GridCell
      value={doc[column.key]}
      width={column.width}
      fieldKey={column.key}
      {ondrill}
      {onedit}
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

  .grid-row:hover {
    background-color: var(--color-bg-hover);
  }

  .grid-row.even {
    background-color: var(--color-bg-secondary);
  }

  .grid-row.even:hover {
    background-color: var(--color-bg-hover);
  }
</style>
