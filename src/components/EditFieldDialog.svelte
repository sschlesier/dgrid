<script lang="ts">
  import { isSerializedBson } from './grid/utils';
  import type { CellType } from './grid/types';
  import * as api from '../api/client';
  import { appStore } from '../stores/app.svelte';
  import Spinner from './Spinner.svelte';

  interface EditFieldInfo {
    connectionId: string;
    database: string;
    collection: string;
    docId: unknown;
    fieldPath: string;
    value: unknown;
    cellType: CellType;
  }

  interface Props {
    field: EditFieldInfo;
    onclose: () => void;
    onsaved: () => void;
  }

  let { field, onclose, onsaved }: Props = $props();

  // Editable type options
  const typeOptions = [
    { value: 'string', label: 'String' },
    { value: 'number', label: 'Number (Int32)' },
    { value: 'Long', label: 'Long (Int64)' },
    { value: 'double', label: 'Double' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'Date', label: 'Date' },
    { value: 'ObjectId', label: 'ObjectId' },
    { value: 'null', label: 'Null' },
    { value: 'Array', label: 'Array (JSON)' },
    { value: 'Object', label: 'Object (JSON)' },
  ] as const;

  // Map CellType to our editable type
  function mapCellTypeToEditType(ct: CellType): string {
    switch (ct) {
      case 'number':
        return 'number';
      case 'Long':
        return 'Long';
      case 'Decimal128':
        return 'double';
      case 'boolean':
        return 'boolean';
      case 'Date':
        return 'Date';
      case 'ObjectId':
        return 'ObjectId';
      case 'UUID':
        return 'string';
      case 'Binary':
        return 'string';
      case 'null':
        return 'null';
      case 'undefined':
        return 'null';
      case 'Array':
        return 'Array';
      case 'Object':
        return 'Object';
      default:
        return 'string';
    }
  }

  // Convert current value to editable text
  function valueToText(value: unknown, _cellType: CellType): string {
    if (value === null || value === undefined) return '';
    if (isSerializedBson(value)) {
      return value._value;
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  let selectedType = $state(mapCellTypeToEditType(field.cellType));
  let valueText = $state(valueToText(field.value, field.cellType));
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let valueRef = $state<HTMLTextAreaElement | HTMLSelectElement | undefined>();

  const hideValueEditor = $derived(selectedType === 'null');
  const showBooleanSelect = $derived(selectedType === 'boolean');

  // Initialize boolean value text
  $effect(() => {
    if (selectedType === 'boolean' && valueText !== 'true' && valueText !== 'false') {
      valueText = 'true';
    }
  });

  // Auto-focus and select the value input on mount
  $effect(() => {
    if (valueRef) {
      requestAnimationFrame(() => {
        valueRef!.focus();
        if (valueRef instanceof HTMLTextAreaElement) {
          valueRef.select();
        }
      });
    }
  });

  function convertValue(
    rawText: string,
    targetType: string
  ): { ok: true; value: unknown } | { ok: false; error: string } {
    switch (targetType) {
      case 'string':
        return { ok: true, value: rawText };

      case 'number': {
        const num = parseFloat(rawText);
        if (isNaN(num)) return { ok: false, error: 'Invalid number' };
        if (!Number.isInteger(num))
          return {
            ok: false,
            error: 'Value must be an integer for Int32. Use Double for decimals.',
          };
        return { ok: true, value: num };
      }

      case 'Long': {
        const trimmed = rawText.trim();
        if (!/^-?\d+$/.test(trimmed))
          return { ok: false, error: 'Invalid integer for Long (Int64)' };
        return { ok: true, value: { _type: 'Long', _value: trimmed } };
      }

      case 'double': {
        const num = parseFloat(rawText);
        if (isNaN(num)) return { ok: false, error: 'Invalid number for Double' };
        return { ok: true, value: num };
      }

      case 'boolean': {
        const lower = rawText.trim().toLowerCase();
        if (lower === 'true') return { ok: true, value: true };
        if (lower === 'false') return { ok: true, value: false };
        return { ok: false, error: 'Boolean must be "true" or "false"' };
      }

      case 'Date': {
        const d = new Date(rawText.trim());
        if (isNaN(d.getTime())) return { ok: false, error: 'Invalid date format' };
        return { ok: true, value: { _type: 'Date', _value: d.toISOString() } };
      }

      case 'ObjectId': {
        const trimmed = rawText.trim();
        if (!/^[0-9a-f]{24}$/i.test(trimmed))
          return { ok: false, error: 'ObjectId must be a 24-character hex string' };
        return { ok: true, value: { _type: 'ObjectId', _value: trimmed } };
      }

      case 'null':
        return { ok: true, value: null };

      case 'Array': {
        try {
          const parsed = JSON.parse(rawText);
          if (!Array.isArray(parsed)) return { ok: false, error: 'Value must be a JSON array' };
          return { ok: true, value: parsed };
        } catch {
          return { ok: false, error: 'Invalid JSON array' };
        }
      }

      case 'Object': {
        try {
          const parsed = JSON.parse(rawText);
          if (Array.isArray(parsed) || typeof parsed !== 'object' || parsed === null) {
            return { ok: false, error: 'Value must be a JSON object' };
          }
          return { ok: true, value: parsed };
        } catch {
          return { ok: false, error: 'Invalid JSON object' };
        }
      }

      default:
        return { ok: false, error: `Unknown type: ${targetType}` };
    }
  }

  async function handleSave() {
    error = null;

    const result = convertValue(valueText, selectedType);
    if (!result.ok) {
      error = result.error;
      return;
    }

    isSaving = true;
    try {
      await api.updateField(field.connectionId, {
        database: field.database,
        collection: field.collection,
        documentId: field.docId,
        fieldPath: field.fieldPath,
        value: result.value,
        type: selectedType,
      });
      appStore.notify('success', 'Field updated');
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
    // Enter to save (but not in multi-line textarea for Array/Object)
    if (event.key === 'Enter' && !isSaving) {
      const isMultiLine = selectedType === 'Array' || selectedType === 'Object';
      if (!isMultiLine || event.metaKey || event.ctrlKey) {
        event.preventDefault();
        handleSave();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dialog-overlay" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <div class="dialog-header">
      <h2>Edit Field</h2>
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
      <div class="form-group">
        <label for="field-path">Field Path</label>
        <div class="field-path-display">{field.fieldPath}</div>
      </div>

      <div class="form-group">
        <label for="field-type">Type</label>
        <select id="field-type" bind:value={selectedType}>
          {#each typeOptions as opt (opt.value)}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>

      {#if !hideValueEditor}
        <div class="form-group">
          <label for="field-value">Value</label>
          {#if showBooleanSelect}
            <select id="field-value" bind:value={valueText} bind:this={valueRef}>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          {:else}
            <textarea
              id="field-value"
              bind:value={valueText}
              bind:this={valueRef}
              rows={selectedType === 'Array' || selectedType === 'Object' ? 8 : 3}
              placeholder="Enter value..."
              spellcheck="false"
            ></textarea>
          {/if}
        </div>
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
        <button type="button" class="save-btn" onclick={handleSave} disabled={isSaving}>
          {#if isSaving}
            <Spinner size="sm" color="white" />
            Saving...
          {:else}
            Save
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .dialog-overlay {
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

  .dialog {
    background-color: var(--color-bg-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-width: 480px;
    max-height: 90vh;
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

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--color-border-light);
  }

  .dialog-header h2 {
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

  .dialog-content {
    padding: var(--space-lg);
    overflow-y: auto;
  }

  .form-group {
    margin-bottom: var(--space-md);
  }

  .form-group label {
    display: block;
    margin-bottom: var(--space-xs);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
  }

  .field-path-display {
    padding: var(--space-sm);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  .form-group select {
    width: 100%;
    padding: var(--space-sm);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    font-size: var(--font-size-md);
    color: var(--color-text-primary);
  }

  .form-group select:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .form-group textarea {
    width: 100%;
    padding: var(--space-sm);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    resize: vertical;
    min-height: 60px;
  }

  .form-group textarea:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .error-message {
    padding: var(--space-sm);
    background-color: var(--color-error-light);
    color: var(--color-error-text);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
  }

  .dialog-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: var(--space-md) var(--space-lg);
    border-top: 1px solid var(--color-border-light);
    gap: var(--space-sm);
  }

  .footer-right {
    display: flex;
    gap: var(--space-sm);
  }

  .dialog-footer button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-lg);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .dialog-footer button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cancel-btn {
    background-color: transparent;
    border: 1px solid var(--color-border-medium);
  }

  .cancel-btn:hover:not(:disabled) {
    background-color: var(--color-bg-hover);
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
