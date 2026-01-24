<script lang="ts">
  import { appStore } from '../stores/app.svelte';
  import { queryStore } from '../stores/query.svelte';

  // Get results info for current tab
  function getResultsInfo(): string {
    const tabId = appStore.activeTabId;
    if (!tabId) return '';

    if (queryStore.getIsExecuting(tabId)) {
      return 'Executing...';
    }

    const results = queryStore.getResults(tabId);
    if (!results) return '';

    const { totalCount, page, pageSize, executionTimeMs } = results;
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalCount);

    return `${start}-${end} of ${totalCount} documents (${executionTimeMs}ms)`;
  }

  function cycleTheme() {
    const themes = ['light', 'dark', 'system'] as const;
    const currentIndex = themes.indexOf(appStore.ui.theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    appStore.setTheme(themes[nextIndex]);
  }

  function getThemeIcon(): string {
    switch (appStore.ui.theme) {
      case 'light':
        return '☀️';
      case 'dark':
        return '🌙';
      case 'system':
        return '💻';
    }
  }
</script>

<footer class="statusbar">
  <div class="statusbar-left">
    {#if appStore.activeConnection}
      <span class="connection-status" class:connected={appStore.activeConnection.isConnected}>
        <span class="status-dot"></span>
        {appStore.activeConnection.name}
        {#if appStore.activeConnection.isConnected}
          <span class="status-text">Connected</span>
        {:else}
          <span class="status-text">Disconnected</span>
        {/if}
      </span>
    {:else}
      <span class="no-connection">No connection selected</span>
    {/if}
  </div>

  <div class="statusbar-center">
    {getResultsInfo()}
  </div>

  <div class="statusbar-right">
    <button class="theme-toggle" onclick={cycleTheme} title={`Theme: ${appStore.ui.theme}`}>
      {getThemeIcon()}
    </button>
  </div>
</footer>

<style>
  .statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--statusbar-height);
    padding: 0 var(--space-md);
    background-color: var(--color-bg-secondary);
    border-top: 1px solid var(--color-border-light);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .statusbar-left,
  .statusbar-right {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .statusbar-center {
    flex: 1;
    text-align: center;
    font-family: var(--font-mono);
  }

  .connection-status {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
    background-color: var(--color-disconnected);
  }

  .connection-status.connected .status-dot {
    background-color: var(--color-connected);
  }

  .status-text {
    color: var(--color-text-muted);
  }

  .no-connection {
    color: var(--color-text-muted);
  }

  .theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    font-size: 12px;
    border-radius: var(--radius-sm);
    transition: background-color var(--transition-fast);
  }

  .theme-toggle:hover {
    background-color: var(--color-bg-hover);
  }
</style>
