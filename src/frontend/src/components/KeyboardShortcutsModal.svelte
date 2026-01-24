<script lang="ts">
  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  const shortcuts = [
    { keys: ['Cmd', 'T'], description: 'New tab', category: 'Tabs' },
    { keys: ['Cmd', 'W'], description: 'Close tab', category: 'Tabs' },
    { keys: ['Cmd', 'Enter'], description: 'Execute query', category: 'Query' },
    { keys: ['Cmd', 'S'], description: 'Save query to file', category: 'Query' },
    { keys: ['Cmd', 'O'], description: 'Load query from file', category: 'Query' },
    { keys: ['Escape'], description: 'Close dialogs', category: 'General' },
    { keys: ['?'], description: 'Show this help', category: 'General' },
  ];

  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce(
    (acc, shortcut) => {
      if (!acc[shortcut.category]) {
        acc[shortcut.category] = [];
      }
      acc[shortcut.category].push(shortcut);
      return acc;
    },
    {} as Record<string, typeof shortcuts>
  );

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onclose();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="modal-overlay" onclick={onclose}>
  <div class="modal" onclick={(e) => e.stopPropagation()}>
    <div class="modal-header">
      <h2>Keyboard Shortcuts</h2>
      <button class="close-btn" onclick={onclose} title="Close">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path
            d="M6 6L14 14M14 6L6 14"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            fill="none"
          />
        </svg>
      </button>
    </div>

    <div class="modal-content">
      {#each Object.entries(groupedShortcuts) as [category, categoryShortcuts]}
        <div class="shortcut-group">
          <h3>{category}</h3>
          <div class="shortcut-list">
            {#each categoryShortcuts as shortcut}
              <div class="shortcut-row">
                <span class="shortcut-description">{shortcut.description}</span>
                <span class="shortcut-keys">
                  {#each shortcut.keys as key, i}
                    <kbd>{key}</kbd>
                    {#if i < shortcut.keys.length - 1}
                      <span class="key-separator">+</span>
                    {/if}
                  {/each}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    <div class="modal-footer">
      <p class="hint">Press <kbd>Escape</kbd> to close</p>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background-color: var(--color-bg-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal-backdrop);
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal {
    background-color: var(--color-bg-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-width: 450px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.2s ease-out;
    z-index: var(--z-modal);
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--color-border-light);
  }

  .modal-header h2 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    color: var(--color-text-secondary);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .close-btn:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .modal-content {
    padding: var(--space-lg);
    overflow-y: auto;
  }

  .shortcut-group {
    margin-bottom: var(--space-lg);
  }

  .shortcut-group:last-child {
    margin-bottom: 0;
  }

  .shortcut-group h3 {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--space-sm);
  }

  .shortcut-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-xs) 0;
  }

  .shortcut-description {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  .shortcut-keys {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    padding: 2px 6px;
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-sm);
    box-shadow: 0 1px 0 var(--color-border-medium);
    color: var(--color-text-primary);
  }

  .key-separator {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .modal-footer {
    padding: var(--space-sm) var(--space-lg);
    border-top: 1px solid var(--color-border-light);
    text-align: center;
  }

  .hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .hint kbd {
    margin: 0 2px;
  }
</style>
