<script lang="ts">
  interface Props {
    title: string;
    message: string;
    confirmLabel?: string;
    onconfirm: () => void;
    oncancel: () => void;
  }

  let { title, message, confirmLabel = 'Confirm', onconfirm, oncancel }: Props = $props();

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      oncancel();
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      onconfirm();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dialog-overlay" onclick={oncancel}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <div class="dialog-header">
      <h2>{title}</h2>
    </div>

    <div class="dialog-content">
      <p>{message}</p>
    </div>

    <div class="dialog-footer">
      <button type="button" class="cancel-btn" onclick={oncancel}>Cancel</button>
      <button type="button" class="confirm-btn" onclick={onconfirm}>{confirmLabel}</button>
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
    max-width: 400px;
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
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--color-border-light);
  }

  .dialog-header h2 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  .dialog-content {
    padding: var(--space-lg);
  }

  .dialog-content p {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    line-height: var(--line-height-normal);
  }

  .dialog-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    border-top: 1px solid var(--color-border-light);
  }

  .dialog-footer button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-sm) var(--space-lg);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .cancel-btn {
    background-color: transparent;
    border: 1px solid var(--color-border-medium);
  }

  .cancel-btn:hover {
    background-color: var(--color-bg-hover);
  }

  .confirm-btn {
    background-color: var(--color-error);
    color: var(--color-primary-text);
    border: 1px solid var(--color-error);
  }

  .confirm-btn:hover {
    opacity: 0.9;
  }
</style>
