<script lang="ts">
  import { editorStore } from '../stores/editor.svelte';

  type DialogMode = 'save' | 'load';

  interface Props {
    mode: DialogMode;
    initialPath?: string;
    apiError?: string | null;
    onconfirm: (_path: string) => void;
    oncancel: () => void;
  }

  let { mode, initialPath = '', apiError = null, onconfirm, oncancel }: Props = $props();

  let path = $state(initialPath);
  let error = $state<string | null>(null);

  const allowedExtensions = ['.js', '.mongodb', '.json'];

  function validatePath(filePath: string): string | null {
    if (!filePath.trim()) {
      return 'File path is required';
    }

    // Check if path is absolute
    if (!filePath.startsWith('/') && !filePath.match(/^[A-Z]:\\/i)) {
      return 'Please enter an absolute file path';
    }

    // Check extension
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    if (!allowedExtensions.includes(ext.toLowerCase())) {
      return `Invalid file type. Allowed: ${allowedExtensions.join(', ')}`;
    }

    return null;
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const validationError = validatePath(path);
    if (validationError) {
      error = validationError;
      return;
    }

    error = null;
    onconfirm(path);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      oncancel();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      oncancel();
    }
  }

  function selectRecentPath(recentPath: string) {
    path = recentPath;
    error = null;
  }

  function handlePathInput(event: Event) {
    path = (event.target as HTMLInputElement).value;
    error = null;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="dialog-backdrop" onclick={handleBackdropClick}>
  <div class="dialog" role="dialog" aria-labelledby="dialog-title">
    <div class="dialog-header">
      <h2 id="dialog-title" class="dialog-title">
        {mode === 'save' ? 'Save Query to File' : 'Load Query from File'}
      </h2>
      <button class="close-btn" onclick={oncancel} aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06L8 9.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L9.06 8l3.72-3.72a.75.75 0 0 0-1.06-1.06L8 6.94 4.28 3.22Z"
          />
        </svg>
      </button>
    </div>

    <form class="dialog-body" onsubmit={handleSubmit}>
      <div class="form-group">
        <label for="file-path" class="form-label">File Path</label>
        <input
          id="file-path"
          type="text"
          class="form-input"
          class:has-error={error || apiError}
          value={path}
          oninput={handlePathInput}
          placeholder="/path/to/query.js"
          autofocus
        />
        {#if error || apiError}
          <span class="form-error">{error || apiError}</span>
        {/if}
        <span class="form-hint">
          Supported formats: {allowedExtensions.join(', ')}
        </span>
      </div>

      {#if editorStore.recentPaths.length > 0}
        <div class="recent-paths">
          <span class="recent-label">Recent files:</span>
          <div class="recent-list">
            {#each editorStore.recentPaths.slice(0, 5) as recentPath (recentPath)}
              <button
                type="button"
                class="recent-item"
                onclick={() => selectRecentPath(recentPath)}
              >
                {recentPath.split('/').pop()}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <div class="dialog-actions">
        <button type="button" class="btn-cancel" onclick={oncancel}> Cancel </button>
        <button type="submit" class="btn-confirm">
          {mode === 'save' ? 'Save' : 'Load'}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-bg-overlay);
    z-index: var(--z-modal);
  }

  .dialog {
    width: 480px;
    max-width: 90vw;
    background-color: var(--color-bg-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md) var(--space-lg);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
  }

  .dialog-title {
    margin: 0;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xs);
    color: var(--color-text-secondary);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
  }

  .close-btn:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .dialog-body {
    padding: var(--space-lg);
  }

  .form-group {
    margin-bottom: var(--space-lg);
  }

  .form-label {
    display: block;
    margin-bottom: var(--space-xs);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .form-input {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
  }

  .form-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-light);
  }

  .form-input.has-error {
    border-color: var(--color-error);
  }

  .form-input.has-error:focus {
    box-shadow: 0 0 0 2px var(--color-error-light);
  }

  .form-error {
    display: block;
    margin-top: var(--space-xs);
    font-size: var(--font-size-xs);
    color: var(--color-error);
  }

  .form-hint {
    display: block;
    margin-top: var(--space-xs);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .recent-paths {
    margin-bottom: var(--space-lg);
  }

  .recent-label {
    display: block;
    margin-bottom: var(--space-xs);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .recent-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .recent-item {
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    color: var(--color-text-secondary);
    background-color: var(--color-bg-tertiary);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .recent-item:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
  }

  .btn-cancel {
    padding: var(--space-sm) var(--space-lg);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
  }

  .btn-cancel:hover {
    background-color: var(--color-bg-hover);
  }

  .btn-confirm {
    padding: var(--space-sm) var(--space-lg);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-primary-text);
    background-color: var(--color-primary);
    border: none;
    border-radius: var(--radius-md);
  }

  .btn-confirm:hover {
    background-color: var(--color-primary-hover);
  }
</style>
