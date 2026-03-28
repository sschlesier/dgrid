<script lang="ts">
  import type { LogEntry } from '../types';
  import { logStore } from '../stores/log.svelte';

  const entries = $derived(logStore.getEntries());

  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  }

  function getSourceLabel(entry: LogEntry): string {
    const parts: string[] = [];

    parts.push(entry.source === 'query' ? 'Query' : 'App');

    if (entry.connectionName) {
      parts.push(entry.connectionName);
    }

    if (entry.tabTitle) {
      parts.push(entry.tabTitle);
    }

    return parts.join(' / ');
  }
</script>

<section class="message-log" aria-label="Message log">
  <div class="message-log-header">
    <div>
      <h3>Message Log</h3>
      <p>{entries.length} entries</p>
    </div>

    <button class="clear-btn" onclick={() => logStore.clear()} disabled={entries.length === 0}>
      Clear
    </button>
  </div>

  <div class="message-log-body">
    {#if entries.length === 0}
      <div class="message-log-empty">No messages yet</div>
    {:else}
      {#each entries as entry (entry.id)}
        <article class="message-log-entry {entry.level}">
          <div class="entry-meta">
            <span class="entry-time">{formatTimestamp(entry.timestamp)}</span>
            <span class="entry-source">{getSourceLabel(entry)}</span>
          </div>
          <pre class="entry-message">{entry.message}</pre>
        </article>
      {/each}
    {/if}
  </div>
</section>

<style>
  .message-log {
    display: flex;
    flex-direction: column;
    min-height: 180px;
    max-height: 220px;
    border-top: 1px solid var(--color-border-light);
    background-color: var(--color-bg-secondary);
    flex-shrink: 0;
  }

  .message-log-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--color-border-light);
  }

  .message-log-header h3,
  .message-log-header p {
    margin: 0;
  }

  .message-log-header h3 {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  .message-log-header p {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .clear-btn {
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    background-color: var(--color-bg-primary);
    transition: background-color var(--transition-fast);
  }

  .clear-btn:hover:not(:disabled) {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .clear-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .message-log-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    overflow: auto;
    font-family: var(--font-mono);
  }

  .message-log-empty {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }

  .message-log-entry {
    padding: var(--space-xs) 0;
    border-bottom: 1px solid var(--color-border-light);
  }

  .message-log-entry:last-child {
    border-bottom: none;
  }

  .entry-meta {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: 2px;
    font-size: var(--font-size-xs);
  }

  .entry-time {
    color: var(--color-text-muted);
  }

  .entry-source {
    color: var(--color-text-secondary);
  }

  .entry-message {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: var(--font-size-xs);
    color: var(--color-text-primary);
  }

  .message-log-entry.success .entry-message {
    color: var(--color-success-text);
  }

  .message-log-entry.error .entry-message {
    color: var(--color-error-text);
  }

  .message-log-entry.warning .entry-message {
    color: var(--color-warning-text);
  }

  .message-log-entry.info .entry-message {
    color: var(--color-text-primary);
  }
</style>
