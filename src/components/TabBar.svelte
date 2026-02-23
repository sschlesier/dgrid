<script lang="ts">
  import { onDestroy } from 'svelte';
  import { appStore } from '../stores/app.svelte';
  import { queryStore } from '../stores/query.svelte';
  import { exportStore } from '../stores/export.svelte';
  import { keybindingsStore } from '../stores/keybindings.svelte';
  import { registerShortcut, unregisterShortcut, bindingToShortcut } from '../utils/keyboard';

  function handleNewTab() {
    const connection = appStore.activeConnection;
    if (connection?.isConnected && appStore.databases.length > 0) {
      // Use the first database as default
      appStore.createTab(connection.id, appStore.databases[0].name);
    }
  }

  function handleCloseTab(id: string) {
    exportStore.cleanupTab(id);
    queryStore.cleanupTab(id);
    appStore.closeTab(id);
  }

  function handleCloseActiveTab() {
    if (appStore.activeTabId) {
      handleCloseTab(appStore.activeTabId);
    }
  }

  $effect(() => {
    const newTabBinding = keybindingsStore.getBinding('new-tab');
    registerShortcut(
      'new-tab',
      bindingToShortcut(newTabBinding, handleNewTab, { alwaysGlobal: true })
    );
  });

  $effect(() => {
    const closeTabBinding = keybindingsStore.getBinding('close-tab');
    registerShortcut(
      'close-tab',
      bindingToShortcut(closeTabBinding, handleCloseActiveTab, { alwaysGlobal: true })
    );
  });

  onDestroy(() => {
    unregisterShortcut('new-tab');
    unregisterShortcut('close-tab');
  });
</script>

<div class="tabbar">
  <div class="tabs">
    {#each appStore.tabs as tab (tab.id)}
      <div
        class="tab"
        class:active={tab.id === appStore.activeTabId}
        onclick={() => appStore.setActiveTab(tab.id)}
        onkeydown={(e) => e.key === 'Enter' && appStore.setActiveTab(tab.id)}
        role="tab"
        tabindex="0"
      >
        <span class="tab-title" title={`${tab.title} - ${tab.database}`}>
          {tab.title}
        </span>
        <span class="tab-database">{tab.database}</span>
        <button
          class="tab-close"
          onclick={(e) => {
            e.stopPropagation();
            handleCloseTab(tab.id);
          }}
          title="Close tab"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path
              d="M3 3L9 9M9 3L3 9"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              fill="none"
            />
          </svg>
        </button>
      </div>
    {/each}
  </div>

  <button
    class="new-tab-btn"
    onclick={handleNewTab}
    disabled={!appStore.activeConnection?.isConnected || appStore.databases.length === 0}
    title="New tab ({keybindingsStore.getFormatted('new-tab')})"
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path
        d="M8 3V13M3 8H13"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        fill="none"
      />
    </svg>
  </button>
</div>

<style>
  .tabbar {
    display: flex;
    align-items: center;
    height: var(--tab-height);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
    padding: 0 var(--space-sm);
    gap: var(--space-sm);
  }

  .tabs {
    display: flex;
    align-items: center;
    flex: 1;
    overflow-x: auto;
    gap: var(--space-xs);
    scrollbar-width: none;
  }

  .tabs::-webkit-scrollbar {
    display: none;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    background-color: transparent;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    white-space: nowrap;
    transition: all var(--transition-fast);
    border: 1px solid transparent;
    border-bottom: none;
  }

  .tab:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .tab.active {
    background-color: var(--color-bg-primary);
    color: var(--color-text-primary);
    border-color: var(--color-border-light);
  }

  .tab-title {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tab-database {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    padding: 1px 4px;
    background-color: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
  }

  .tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    color: var(--color-text-muted);
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all var(--transition-fast);
  }

  .tab:hover .tab-close {
    opacity: 1;
  }

  .tab-close:hover {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  .new-tab-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--color-text-secondary);
    border-radius: var(--radius-md);
    flex-shrink: 0;
    transition: all var(--transition-fast);
  }

  .new-tab-btn:hover:not(:disabled) {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .new-tab-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
