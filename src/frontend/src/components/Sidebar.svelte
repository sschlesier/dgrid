<script lang="ts">
  import { appStore } from '../stores/app.svelte';

  interface Props {
    onEditConnection: (_id: string) => void;
  }

  let { onEditConnection }: Props = $props();

  async function handleConnect(id: string) {
    await appStore.connect(id);
  }

  async function handleDisconnect(id: string) {
    await appStore.disconnect(id);
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <h2>Connections</h2>
  </div>

  <div class="sidebar-content">
    {#if appStore.connections.length === 0}
      <div class="empty-state">
        <p>No connections yet</p>
      </div>
    {:else}
      <ul class="connection-list">
        {#each appStore.connections as connection (connection.id)}
          <li class="connection-item" class:active={connection.id === appStore.activeConnectionId}>
            <button
              class="connection-info"
              onclick={() => appStore.setActiveConnection(connection.id)}
            >
              <span
                class="status-indicator"
                class:connected={connection.isConnected}
                title={connection.isConnected ? 'Connected' : 'Disconnected'}
              ></span>
              <div class="connection-details">
                <span class="connection-name">{connection.name}</span>
                <span class="connection-host">
                  {connection.host}:{connection.port}
                </span>
              </div>
            </button>

            <div class="connection-actions">
              {#if connection.isConnected}
                <button
                  class="action-btn"
                  onclick={() => handleDisconnect(connection.id)}
                  title="Disconnect"
                  disabled={appStore.isConnecting}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path
                      d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      fill="none"
                    />
                  </svg>
                </button>
              {:else}
                <button
                  class="action-btn connect"
                  onclick={() => handleConnect(connection.id)}
                  title="Connect"
                  disabled={appStore.isConnecting}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M6 4L12 8L6 12V4Z" />
                  </svg>
                </button>
              {/if}
              <button
                class="action-btn"
                onclick={() => onEditConnection(connection.id)}
                title="Edit connection"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M11.5 2.5l2 2-7 7H4.5v-2l7-7z" />
                </svg>
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</aside>

<style>
  .sidebar {
    width: var(--sidebar-width);
    background-color: var(--color-bg-secondary);
    border-right: 1px solid var(--color-border-light);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    padding: var(--space-md);
    border-bottom: 1px solid var(--color-border-light);
  }

  .sidebar-header h2 {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
  }

  .empty-state {
    padding: var(--space-xl);
    text-align: center;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }

  .connection-list {
    padding: var(--space-sm);
  }

  .connection-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-xs);
    transition: background-color var(--transition-fast);
  }

  .connection-item:hover {
    background-color: var(--color-bg-hover);
  }

  .connection-item.active {
    background-color: var(--color-bg-active);
  }

  .connection-info {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex: 1;
    text-align: left;
    min-width: 0;
  }

  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    background-color: var(--color-disconnected);
    flex-shrink: 0;
  }

  .status-indicator.connected {
    background-color: var(--color-connected);
  }

  .connection-details {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .connection-name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .connection-host {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .connection-actions {
    display: flex;
    gap: var(--space-xs);
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .connection-item:hover .connection-actions {
    opacity: 1;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--color-text-secondary);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .action-btn:hover:not(:disabled) {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.connect {
    color: var(--color-connected);
  }
</style>
