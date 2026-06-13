<script lang="ts">
  import * as api from '../api/client';
  import { appStore } from '../stores/app.svelte';
  import Spinner from './Spinner.svelte';

  interface Props {
    mode: 'edit' | 'insert';
    connectionId: string;
    database: string;
    collection: string;
    docId?: unknown;
    initialJson?: string;
    onclose: () => void;
    onsaved: () => void;
  }

  let {
    mode,
    connectionId,
    database,
    collection,
    docId,
    initialJson = '{}',
    onclose,
    onsaved,
  }: Props = $props();

  let jsonText = $state(initialJson);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let textareaRef = $state<HTMLTextAreaElement | undefined>();

  const title = $derived(mode === 'edit' ? 'Edit Document' : 'Insert Document');
  const saveLabel = $derived(mode === 'edit' ? 'Save' : 'Insert');

  const validationResult = $derived.by(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { ok: false as const, error: 'Document must be a JSON object' };
      }
      return { ok: true as const, value: parsed };
    } catch (e) {
      return { ok: false as const, error: (e as SyntaxError).message };
    }
  });

  $effect(() => {
    if (textareaRef) {
      requestAnimationFrame(() => textareaRef?.focus());
    }
  });

  function handleFormat() {
    if (!validationResult.ok) return;
    jsonText = JSON.stringify(validationResult.value, null, 2);
  }

  async function handleSave() {
    if (!validationResult.ok) {
      error = validationResult.error;
      return;
    }
    error = null;
    isSaving = true;
    try {
      if (mode === 'edit') {
        await api.updateDocument(connectionId, {
          database,
          collection,
          documentId: docId,
          document: validationResult.value,
        });
        appStore.notify('success', 'Document updated');
      } else {
        await api.insertDocument(connectionId, {
          database,
          collection,
          document: validationResult.value,
        });
        appStore.notify('success', 'Document inserted');
      }
      onsaved();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      isSaving = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onclose();
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !isSaving) {
      event.preventDefault();
      handleSave();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dialog-overlay" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dialog json-editor-dialog" onclick={(e) => e.stopPropagation()}>
    <div class="dialog-header">
      <h2>{title}</h2>
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

    <div class="dialog-content">
      <div class="editor-toolbar">
        <span class="editor-hint">
          {mode === 'edit'
            ? 'Edit the document JSON. The _id field cannot be changed.'
            : 'Enter valid JSON for the new document.'}
        </span>
        <button
          type="button"
          class="format-btn"
          onclick={handleFormat}
          disabled={!validationResult.ok}
          title="Format JSON"
        >
          Format
        </button>
      </div>

      <textarea
        class="json-editor"
        class:invalid={!validationResult.ok && jsonText !== initialJson}
        bind:value={jsonText}
        bind:this={textareaRef}
        spellcheck="false"
        autocorrect="off"
        autocapitalize="off"
        rows={20}
        placeholder="Enter JSON object..."
      ></textarea>

      {#if !validationResult.ok && jsonText.trim() !== ''}
        <div class="validation-error">{validationResult.error}</div>
      {/if}

      {#if error}
        <div class="error-message">{error}</div>
      {/if}
    </div>

    <div class="dialog-footer">
      <div class="footer-right">
        <button type="button" class="cancel-btn" onclick={onclose} disabled={isSaving}>
          Cancel
        </button>
        <button
          type="button"
          class="save-btn"
          onclick={handleSave}
          disabled={isSaving || !validationResult.ok}
        >
          {#if isSaving}
            <Spinner size="sm" color="white" />
            Saving...
          {:else}
            {saveLabel}
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .json-editor-dialog {
    width: 680px;
    max-width: 95vw;
    max-height: 90vh;
  }

  .editor-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }

  .editor-hint {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    flex: 1;
  }

  .format-btn {
    padding: 4px 10px;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .format-btn:hover:not(:disabled) {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .format-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .json-editor {
    width: 100%;
    padding: var(--space-md);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    resize: vertical;
    min-height: 200px;
    line-height: var(--line-height-normal);
    box-sizing: border-box;
  }

  .json-editor:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .json-editor.invalid {
    border-color: var(--color-error);
  }

  .validation-error {
    margin-top: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-error-light);
    color: var(--color-error-text);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-family: var(--font-mono);
  }

  .error-message {
    margin-top: var(--space-sm);
    padding: var(--space-sm);
    background-color: var(--color-error-light);
    color: var(--color-error-text);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
  }

  .save-btn {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
    border: 1px solid var(--color-primary);
  }

  .save-btn:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
  }
</style>
