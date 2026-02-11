<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { appStore } from '../stores/app.svelte';
  import KeyboardShortcutsModal from './KeyboardShortcutsModal.svelte';
  import { registerShortcut, unregisterShortcut } from '../utils/keyboard';

  interface Props {
    onNewConnection: () => void;
  }

  let { onNewConnection }: Props = $props();

  let showShortcuts = $state(false);

  function toggleShortcuts() {
    showShortcuts = !showShortcuts;
  }

  onMount(() => {
    registerShortcut('show-help', {
      key: '?',
      handler: () => {
        showShortcuts = true;
      },
    });
  });

  onDestroy(() => {
    unregisterShortcut('show-help');
  });
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
    {#if appStore.updateAvailable}
      <a
        class="update-badge"
        href={appStore.updateAvailable.url}
        target="_blank"
        rel="noopener noreferrer"
        title="A new version is available — click to view release"
      >
        Update v{appStore.updateAvailable.version}
      </a>
    {/if}
    <button class="help-btn" onclick={toggleShortcuts} title="Keyboard Shortcuts (?)">
      <svg
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <circle cx="10" cy="10" r="8" />
        <text
          x="10"
          y="14"
          text-anchor="middle"
          fill="currentColor"
          stroke="none"
          font-size="11"
          font-weight="600">?</text
        >
      </svg>
    </button>
    <button class="header-btn primary" onclick={onNewConnection} title="Add new connection">
      New Connection
    </button>
  </div>
</header>

{#if showShortcuts}
  <KeyboardShortcutsModal onclose={() => (showShortcuts = false)} />
{/if}

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

  .update-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px var(--space-sm);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-primary);
    background-color: color-mix(in srgb, var(--color-primary) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
    border-radius: var(--radius-full, 9999px);
    text-decoration: none;
    white-space: nowrap;
    transition: all var(--transition-fast);
  }

  .update-badge:hover {
    background-color: color-mix(in srgb, var(--color-primary) 20%, transparent);
    border-color: var(--color-primary);
  }

  .help-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    color: var(--color-text-secondary);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .help-btn:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }
</style>
