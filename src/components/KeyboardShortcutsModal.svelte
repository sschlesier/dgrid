<script lang="ts">
  import { keybindingsStore, SHORTCUT_DEFINITIONS } from '../stores/keybindings.svelte';
  import type { ShortcutBinding } from '../stores/keybindings.svelte';
  import { isMac } from '../utils/keyboard';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  // Editing state
  let editingId = $state<string | null>(null);
  let conflictId = $state<string | null>(null);
  let pendingBinding = $state<ShortcutBinding | null>(null);

  // Category ordering
  const categoryOrder = ['General', 'Tabs', 'Query', 'File'];

  // Group definitions by category
  const groupedDefinitions = $derived.by(() => {
    const groups: Record<string, typeof SHORTCUT_DEFINITIONS> = {};
    for (const def of SHORTCUT_DEFINITIONS) {
      if (!groups[def.category]) groups[def.category] = [];
      groups[def.category].push(def);
    }
    // Return in defined order
    return categoryOrder
      .filter((cat) => groups[cat])
      .map((cat) => ({ category: cat, shortcuts: groups[cat] }));
  });

  // Check if any shortcut is customized (for Reset All button visibility)
  const hasAnyCustomization = $derived(
    SHORTCUT_DEFINITIONS.some((d) => keybindingsStore.isCustomized(d.id))
  );

  function handleKeyDown(event: KeyboardEvent) {
    if (editingId) {
      event.preventDefault();
      event.stopPropagation();

      // Escape cancels editing
      if (event.key === 'Escape') {
        cancelEditing();
        return;
      }

      // Ignore lone modifier keys
      if (['Meta', 'Control', 'Shift', 'Alt'].includes(event.key)) {
        return;
      }

      const binding: ShortcutBinding = {
        key: event.key,
        ...(event.metaKey || event.ctrlKey ? { meta: true } : {}),
        ...(event.shiftKey && (event.metaKey || event.ctrlKey) ? { shift: true } : {}),
        ...(event.altKey ? { alt: true } : {}),
      };

      // Check for conflict
      const conflict = keybindingsStore.findConflict(editingId, binding);
      if (conflict) {
        conflictId = conflict;
        pendingBinding = binding;
        return;
      }

      applyBinding(editingId, binding);
      return;
    }

    // Normal modal: Escape closes
    if (event.key === 'Escape') {
      onclose();
    }
  }

  function startEditing(id: string) {
    editingId = id;
    conflictId = null;
    pendingBinding = null;
  }

  function cancelEditing() {
    editingId = null;
    conflictId = null;
    pendingBinding = null;
  }

  function applyBinding(id: string, binding: ShortcutBinding) {
    keybindingsStore.setBinding(id, binding);
    editingId = null;
    conflictId = null;
    pendingBinding = null;
  }

  function assignAnyway() {
    if (!editingId || !pendingBinding || !conflictId) return;
    // Remove the conflicting binding first
    keybindingsStore.resetBinding(conflictId);
    applyBinding(editingId, pendingBinding);
  }

  function resetShortcut(id: string) {
    keybindingsStore.resetBinding(id);
    if (editingId === id) cancelEditing();
  }

  function resetAll() {
    keybindingsStore.resetAll();
    cancelEditing();
  }

  function getConflictDescription(): string {
    if (!conflictId) return '';
    const def = SHORTCUT_DEFINITIONS.find((d) => d.id === conflictId);
    return def?.description ?? conflictId;
  }

  // Split a formatted shortcut string into individual key parts for <kbd> rendering
  function splitFormattedKeys(formatted: string): string[] {
    const mac = isMac();
    if (mac) {
      // On Mac, symbols are joined without separator — split into individual characters/groups
      const parts: string[] = [];
      let i = 0;
      while (i < formatted.length) {
        const ch = formatted[i];
        // Modifier symbols are single characters
        if (['⌘', '⇧', '⌥', '⌃'].includes(ch)) {
          parts.push(ch);
          i++;
        } else {
          // The rest is the key name (could be multi-char like 'Esc' or '↵')
          parts.push(formatted.slice(i));
          break;
        }
      }
      return parts;
    } else {
      // On Windows/Linux, keys are separated by '+'
      return formatted.split('+');
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-overlay" onclick={onclose} onkeydown={() => {}}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
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
      {#each groupedDefinitions as group}
        <div class="shortcut-group">
          <h3>{group.category}</h3>
          <div class="shortcut-list">
            {#each group.shortcuts as def}
              {@const isEditing = editingId === def.id}
              {@const isConflict = editingId === def.id && conflictId !== null}
              {@const isCustom = keybindingsStore.isCustomized(def.id)}
              {@const formatted = keybindingsStore.getFormatted(def.id)}
              <div class="shortcut-row" class:editing={isEditing} class:conflict={isConflict}>
                <span class="shortcut-description">{def.description}</span>
                <span class="shortcut-actions">
                  {#if isEditing}
                    {#if conflictId && pendingBinding}
                      <span class="conflict-info">
                        <span class="conflict-text">
                          Conflicts with "{getConflictDescription()}"
                        </span>
                        <button class="conflict-btn assign-btn" onclick={assignAnyway}>
                          Assign
                        </button>
                        <button class="conflict-btn" onclick={cancelEditing}> Cancel </button>
                      </span>
                    {:else}
                      <span class="capture-zone" data-testid="capture-zone">
                        Press shortcut...
                      </span>
                      <button class="cancel-edit-btn" onclick={cancelEditing} title="Cancel">
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            d="M6 6L14 14M14 6L6 14"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            fill="none"
                          />
                        </svg>
                      </button>
                    {/if}
                  {:else}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <span
                      class="shortcut-keys clickable"
                      class:customized={isCustom}
                      onclick={() => startEditing(def.id)}
                      data-testid="shortcut-keys-{def.id}"
                      title="Click to edit"
                    >
                      {#each splitFormattedKeys(formatted) as keyPart, i}
                        <kbd>{keyPart}</kbd>
                        {#if i < splitFormattedKeys(formatted).length - 1}
                          <span class="key-separator">+</span>
                        {/if}
                      {/each}
                    </span>
                    {#if isCustom}
                      <button
                        class="reset-btn"
                        onclick={() => resetShortcut(def.id)}
                        title="Reset to default"
                        data-testid="reset-{def.id}"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                          <path
                            d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"
                          />
                        </svg>
                      </button>
                    {/if}
                  {/if}
                </span>
              </div>
            {/each}

            {#if group.category === 'General'}
              <!-- Static Escape row -->
              <div class="shortcut-row static">
                <span class="shortcut-description">Close dialogs</span>
                <span class="shortcut-actions">
                  <span class="shortcut-keys static">
                    <kbd>Esc</kbd>
                  </span>
                </span>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <div class="modal-footer">
      {#if hasAnyCustomization}
        <button class="reset-all-btn" onclick={resetAll} data-testid="reset-all-btn">
          Reset All Defaults
        </button>
      {/if}
      <p class="hint">Click a shortcut to edit &middot; Press <kbd>Escape</kbd> to close</p>
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
    max-width: 520px;
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
    padding: var(--space-xs) var(--space-xs);
    border-radius: var(--radius-sm);
    min-height: 36px;
  }

  .shortcut-row.editing {
    background-color: var(--color-bg-secondary);
  }

  .shortcut-row.conflict {
    background-color: var(--color-warning-light);
  }

  .shortcut-row.static {
    opacity: 0.6;
  }

  .shortcut-description {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  .shortcut-actions {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .shortcut-keys {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .shortcut-keys.clickable {
    cursor: pointer;
    padding: 2px 4px;
    border-radius: var(--radius-sm);
    transition: background-color var(--transition-fast);
  }

  .shortcut-keys.clickable:hover {
    background-color: var(--color-bg-hover);
  }

  .shortcut-keys.customized kbd {
    background-color: var(--color-primary-light);
    border-color: var(--color-primary);
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

  .capture-zone {
    font-size: var(--font-size-sm);
    color: var(--color-primary);
    font-style: italic;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .cancel-edit-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--color-text-muted);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .cancel-edit-btn:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .conflict-info {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--font-size-xs);
  }

  .conflict-text {
    color: var(--color-warning-text, var(--color-text-secondary));
  }

  .conflict-btn {
    padding: 2px var(--space-sm);
    font-size: var(--font-size-xs);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border-medium);
    background-color: var(--color-bg-primary);
    color: var(--color-text-primary);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .conflict-btn:hover {
    background-color: var(--color-bg-hover);
  }

  .conflict-btn.assign-btn {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
    border-color: var(--color-primary);
  }

  .conflict-btn.assign-btn:hover {
    background-color: var(--color-primary-hover);
  }

  .reset-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--color-text-muted);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    opacity: 0;
  }

  .shortcut-row:hover .reset-btn {
    opacity: 1;
  }

  .reset-btn:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .modal-footer {
    padding: var(--space-sm) var(--space-lg);
    border-top: 1px solid var(--color-border-light);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
  }

  .reset-all-btn {
    padding: var(--space-xs) var(--space-md);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    background: none;
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .reset-all-btn:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .hint kbd {
    margin: 0 2px;
  }
</style>
