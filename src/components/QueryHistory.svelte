<script lang="ts">
  import type { QueryHistoryItem } from '../types';

  interface Props {
    history: QueryHistoryItem[];
    onselect: (_item: QueryHistoryItem) => void;
    onclear: () => void;
    onclose: () => void;
  }

  let { history, onselect, onclear, onclose }: Props = $props();

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onclose();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onclose();
    }
  }

  function truncateQuery(query: string, maxLength = 60): string {
    const firstLine = query.split('\n')[0];
    if (firstLine.length <= maxLength) {
      return firstLine;
    }
    return firstLine.slice(0, maxLength) + '...';
  }

  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'Just now';
    }
    if (diffMins < 60) {
      return `${diffMins}m ago`;
    }
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }
    return date.toLocaleDateString();
  }

  function formatExecutionTime(ms: number | undefined): string {
    if (ms === undefined) return '';
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="history-backdrop" onclick={handleBackdropClick}>
  <div class="history-dropdown">
    <div class="history-header">
      <span class="history-title">Query History</span>
      <div class="history-actions">
        {#if history.length > 0}
          <button class="clear-btn" onclick={onclear}>Clear All</button>
        {/if}
        <button class="close-btn" onclick={onclose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06L8 9.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L9.06 8l3.72-3.72a.75.75 0 0 0-1.06-1.06L8 6.94 4.28 3.22Z"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="history-list">
      {#if history.length === 0}
        <div class="empty-history">
          <p>No queries in history</p>
        </div>
      {:else}
        {#each history as item (item.id)}
          <button class="history-item" onclick={() => onselect(item)}>
            <div class="item-query">{truncateQuery(item.query)}</div>
            <div class="item-meta">
              <span class="item-database">{item.database}</span>
              <span class="item-time">{formatTimestamp(item.timestamp)}</span>
              {#if item.executionTimeMs !== undefined}
                <span class="item-duration">{formatExecutionTime(item.executionTimeMs)}</span>
              {/if}
            </div>
          </button>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .history-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-dropdown);
  }

  .history-dropdown {
    position: absolute;
    top: calc(var(--header-height) + var(--tab-height) + 44px);
    left: calc(var(--sidebar-width) + var(--space-md));
    width: 400px;
    max-height: 400px;
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
  }

  .history-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .history-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .clear-btn {
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-xs);
    color: var(--color-error);
    background: none;
    border: 1px solid var(--color-error);
    border-radius: var(--radius-sm);
  }

  .clear-btn:hover {
    background-color: var(--color-error-light);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xs);
    color: var(--color-text-secondary);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
  }

  .close-btn:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .history-list {
    flex: 1;
    overflow-y: auto;
  }

  .empty-history {
    padding: var(--space-xl);
    text-align: center;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }

  .history-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    text-align: left;
    background: none;
    border: none;
    border-bottom: 1px solid var(--color-border-light);
    cursor: pointer;
  }

  .history-item:hover {
    background-color: var(--color-bg-hover);
  }

  .history-item:last-child {
    border-bottom: none;
  }

  .item-query {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    word-break: break-all;
  }

  .item-meta {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .item-database {
    padding: 2px 6px;
    background-color: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
  }

  .item-duration {
    color: var(--color-text-muted);
  }
</style>
