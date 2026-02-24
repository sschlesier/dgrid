<script lang="ts">
  import type { ViewMode } from '../grid/types';

  interface Props {
    value: ViewMode;
    onchange: (_mode: ViewMode) => void;
  }

  let { value, onchange }: Props = $props();

  const views: { mode: ViewMode; label: string; icon: string }[] = [
    { mode: 'table', label: 'Table', icon: 'table' },
    { mode: 'json', label: 'JSON', icon: 'json' },
    { mode: 'tree', label: 'Tree', icon: 'tree' },
  ];
</script>

<div class="view-selector">
  {#each views as view}
    <button
      class="view-btn"
      class:active={value === view.mode}
      onclick={() => onchange(view.mode)}
      title="{view.label} View"
    >
      {#if view.icon === 'table'}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25ZM6.5 6.5v8h7.75a.25.25 0 0 0 .25-.25V6.5Zm8-1.5V1.75a.25.25 0 0 0-.25-.25H6.5V5ZM5 5V1.5H1.75a.25.25 0 0 0-.25.25V5Zm-3.5 1v8.25c0 .138.112.25.25.25H5V6.5Z"
          />
        </svg>
      {:else if view.icon === 'json'}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9ZM3.5 3a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-9Z"
          />
          <path d="M5.5 5h2v1h-2V5Zm3 0h2v1h-2V5Zm-3 2.5h5v1h-5v-1Zm0 2.5h3v1h-3v-1Z" />
        </svg>
      {:else if view.icon === 'tree'}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M4.75 7a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5ZM5 4.75A.75.75 0 0 1 5.75 4h5.5a.75.75 0 0 1 0 1.5h-5.5A.75.75 0 0 1 5 4.75ZM6.75 10a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z"
          />
          <path
            d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25Z"
          />
        </svg>
      {/if}
      <span class="view-label">{view.label}</span>
    </button>
  {/each}
</div>

<style>
  .view-selector {
    display: flex;
    gap: 2px;
    padding: 2px;
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-md);
  }

  .view-btn {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .view-btn:hover {
    color: var(--color-text-primary);
    background-color: var(--color-bg-hover);
  }

  .view-btn.active {
    color: var(--color-primary);
    background-color: var(--color-bg-primary);
    box-shadow: var(--shadow-sm);
  }

  .view-label {
    font-weight: var(--font-weight-medium);
  }
</style>
