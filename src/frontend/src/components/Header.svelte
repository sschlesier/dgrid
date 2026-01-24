<script lang="ts">
  import { appStore } from '../stores/app.svelte';

  interface Props {
    onNewConnection: () => void;
  }

  let { onNewConnection }: Props = $props();
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

  <div class="header-right">
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

  .header-btn.primary {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
    border-color: var(--color-primary);
  }

  .header-btn.primary:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
  }
</style>
