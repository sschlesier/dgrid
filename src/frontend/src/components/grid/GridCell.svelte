<script lang="ts">
  import type { CellType } from './types';
  import {
    detectCellType,
    formatCellValue,
    formatCellCopyValue,
    getCellTypeClass,
    isDrillable,
  } from './utils';
  import { matchesShortcut } from '../../utils/keyboard';

  interface Props {
    value: unknown;
    width: number;
    ondrill?: (_field: string) => void;
    onedit?: (_fieldKey: string, _value: unknown) => void;
    fieldKey?: string;
  }

  let { value, width, ondrill, onedit, fieldKey }: Props = $props();

  let showCopyButton = $state(false);
  let copied = $state(false);

  const cellType = $derived<CellType>(detectCellType(value));
  const displayValue = $derived(formatCellValue(value, cellType));
  const typeClass = $derived(getCellTypeClass(cellType));
  const canDrill = $derived(isDrillable(value));

  function handleClick() {
    if (canDrill && ondrill && fieldKey) {
      ondrill(fieldKey);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if ((event.key === 'Enter' || event.key === ' ') && canDrill && ondrill && fieldKey) {
      event.preventDefault();
      ondrill(fieldKey);
    }
    if (matchesShortcut(event, { key: 'e', meta: true, handler: () => {} }) && onedit && fieldKey) {
      event.preventDefault();
      event.stopPropagation();
      onedit(fieldKey, value);
    }
  }

  async function handleCopy(event: MouseEvent) {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(formatCellCopyValue(value));
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // Clipboard API may fail in some contexts
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="grid-cell {typeClass}"
  class:drillable={canDrill}
  style="width: {width}px; min-width: {width}px; max-width: {width}px;"
  data-field-key={fieldKey}
  onclick={handleClick}
  onkeydown={handleKeydown}
  onmouseenter={() => (showCopyButton = true)}
  onmouseleave={() => (showCopyButton = false)}
  role={canDrill ? 'button' : undefined}
  tabindex="0"
>
  <span class="cell-content" title={displayValue}>
    {displayValue}
  </span>

  {#if showCopyButton}
    <button
      class="copy-button"
      class:copied
      onclick={handleCopy}
      title={copied ? 'Copied!' : 'Copy value'}
    >
      {#if copied}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"
          />
        </svg>
      {:else}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"
          />
          <path
            d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"
          />
        </svg>
      {/if}
    </button>
  {/if}
</div>

<style>
  .grid-cell {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0 var(--space-sm);
    overflow: hidden;
    position: relative;
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    border-right: 1px solid var(--color-border-light);
  }

  .cell-content {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Type-specific styles */
  .cell-id {
    color: var(--color-primary);
  }

  .cell-date {
    color: var(--color-info);
  }

  .cell-number {
    color: var(--color-success);
  }

  .cell-boolean {
    color: var(--color-warning);
    font-weight: var(--font-weight-medium);
  }

  .cell-null {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .cell-string {
    color: var(--color-text-primary);
  }

  .cell-binary {
    color: var(--color-text-secondary);
  }

  .cell-drillable {
    color: var(--color-primary);
  }

  /* Drillable cells are clickable */
  .drillable {
    cursor: pointer;
  }

  .drillable:hover {
    background-color: var(--color-bg-hover);
  }

  .grid-cell:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  /* Copy button */
  .copy-button {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    opacity: 0.8;
    transition: all var(--transition-fast);
  }

  .copy-button:hover {
    opacity: 1;
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  .copy-button.copied {
    color: var(--color-success);
  }
</style>
