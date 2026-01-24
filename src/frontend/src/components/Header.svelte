<script lang="ts">
  import { appStore } from '../stores/app.svelte';

  interface Props {
    onNewConnection: () => void;
  }

  let { onNewConnection }: Props = $props();

  let selectedDatabase = $state('');

  function handleConnectionChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const connectionId = select.value;
    if (connectionId) {
      appStore.setActiveConnection(connectionId);
      selectedDatabase = '';
    }
  }

  function handleDatabaseChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    selectedDatabase = select.value;
  }

  function handleNewTab() {
    if (appStore.activeConnectionId && selectedDatabase) {
      appStore.createTab(appStore.activeConnectionId, selectedDatabase);
    }
  }
</script>

<header class="header">
  <div class="header-left">
    <button
      class="sidebar-toggle"
      onclick={() => appStore.toggleSidebar()}
      title={appStore.ui.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
        <rect x="3" y="4" width="14" height="2" rx="1" />
        <rect x="3" y="9" width="14" height="2" rx="1" />
        <rect x="3" y="14" width="14" height="2" rx="1" />
      </svg>
    </button>
    <h1 class="app-title">DGrid</h1>
  </div>

  <div class="header-center">
    <select
      class="connection-select"
      value={appStore.activeConnectionId ?? ''}
      onchange={handleConnectionChange}
    >
      <option value="">Select connection...</option>
      {#each appStore.connections as connection (connection.id)}
        <option value={connection.id}>
          {connection.name}
          {#if connection.isConnected}(connected){/if}
        </option>
      {/each}
    </select>

    {#if appStore.activeConnection?.isConnected}
      <select
        class="database-select"
        value={selectedDatabase}
        onchange={handleDatabaseChange}
        disabled={appStore.isLoadingDatabases}
      >
        <option value="">Select database...</option>
        {#each appStore.databases as database (database.name)}
          <option value={database.name}>{database.name}</option>
        {/each}
      </select>
    {/if}
  </div>

  <div class="header-right">
    <button
      class="header-btn"
      onclick={handleNewTab}
      disabled={!appStore.activeConnectionId || !selectedDatabase}
      title="New query tab"
    >
      New Tab
    </button>
    <button class="header-btn primary" onclick={onNewConnection} title="Add new connection">
      New Connection
    </button>
  </div>
</header>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--header-height);
    padding: 0 var(--space-md);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
    gap: var(--space-md);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .sidebar-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    color: var(--color-text-secondary);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .sidebar-toggle:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .app-title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .header-center {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex: 1;
    justify-content: center;
  }

  .connection-select,
  .database-select {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    min-width: 180px;
  }

  .connection-select:focus,
  .database-select:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .header-btn {
    padding: var(--space-xs) var(--space-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-medium);
    background-color: var(--color-bg-primary);
    transition: all var(--transition-fast);
  }

  .header-btn:hover:not(:disabled) {
    background-color: var(--color-bg-hover);
  }

  .header-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .header-btn.primary {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
    border-color: var(--color-primary);
  }

  .header-btn.primary:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
  }
</style>
