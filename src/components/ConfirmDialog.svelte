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
  .dialog {
    max-width: 400px;
  }

  .dialog-content p {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    line-height: var(--line-height-normal);
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
