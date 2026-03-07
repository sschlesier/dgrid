<script lang="ts">
  import { onDestroy } from 'svelte';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { appStore } from '../stores/app.svelte';
  import { keybindingsStore } from '../stores/keybindings.svelte';
  import KeyboardShortcutsModal from './KeyboardShortcutsModal.svelte';
  import { registerShortcut, unregisterShortcut, bindingToShortcut } from '../utils/keyboard';

  interface Props {
    onNewConnection: () => void;
  }

  let { onNewConnection }: Props = $props();

  let showShortcuts = $state(false);
  let showUpdatePopover = $state(false);
  let copied = $state(false);
  let updateWrapperEl = $state<HTMLElement | null>(null);

  function toggleShortcuts() {
    showShortcuts = !showShortcuts;
  }

  function toggleUpdatePopover() {
    showUpdatePopover = !showUpdatePopover;
  }

  async function copyBrewCommand() {
    await navigator.clipboard.writeText('brew upgrade dgrid');
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  async function openReleaseUrl() {
    if (appStore.updateAvailable?.url) {
      await openUrl(appStore.updateAvailable.url);
    }
  }

  $effect(() => {
    const binding = keybindingsStore.getBinding('show-help');
    registerShortcut(
      'show-help',
      bindingToShortcut(binding, () => {
        showShortcuts = true;
      })
    );
  });

  $effect(() => {
    if (!showUpdatePopover) return;

    function handleDocClick(e: MouseEvent) {
      if (updateWrapperEl && !updateWrapperEl.contains(e.target as Node)) {
        showUpdatePopover = false;
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        showUpdatePopover = false;
      }
    }

    document.addEventListener('click', handleDocClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleDocClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
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
      <div class="update-wrapper" bind:this={updateWrapperEl}>
        <button
          class="update-badge"
          onclick={toggleUpdatePopover}
          title="A new version is available"
        >
          Update v{appStore.updateAvailable.version}
        </button>

        {#if showUpdatePopover}
          <div class="update-popover">
            {#if appStore.installMethod === 'homebrew'}
              <p class="popover-label">Run in your terminal:</p>
              <div class="brew-command-row">
                <code class="brew-command">brew upgrade dgrid</code>
                <button class="copy-btn" onclick={copyBrewCommand} title="Copy command">
                  {#if copied}
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fill-rule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  {:else}
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        d="M8 2a2 2 0 00-2 2v10a2 2 0 002 2h6a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H8z"
                      />
                      <path
                        d="M4 6a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2v-1H8a4 4 0 01-4-4V6z"
                      />
                    </svg>
                  {/if}
                </button>
              </div>
            {:else}
              <button class="download-link" onclick={openReleaseUrl}>
                Download v{appStore.updateAvailable.version}
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
    <button
      class="help-btn"
      onclick={toggleShortcuts}
      title="Keyboard Shortcuts ({keybindingsStore.getFormatted('show-help')})"
    >
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

  .update-wrapper {
    position: relative;
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
    white-space: nowrap;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .update-badge:hover {
    background-color: color-mix(in srgb, var(--color-primary) 20%, transparent);
    border-color: var(--color-primary);
  }

  .update-popover {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 240px;
    padding: var(--space-md);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
  }

  .popover-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-xs) 0;
  }

  .brew-command-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .brew-command {
    flex: 1;
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-sm);
    font-family: var(--font-mono, monospace);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-sm);
    background-color: var(--color-bg-secondary);
    transition: all var(--transition-fast);
  }

  .copy-btn:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .download-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    width: 100%;
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-primary);
    background: none;
    border: 1px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .download-link:hover {
    background-color: color-mix(in srgb, var(--color-primary) 10%, transparent);
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
