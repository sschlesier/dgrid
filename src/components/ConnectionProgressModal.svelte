<script lang="ts">
  import Spinner from './Spinner.svelte';

  interface Props {
    connectionName: string;
    status?: string;
    isCancelling?: boolean;
    oncancel: () => void;
  }

  let {
    connectionName,
    status = 'Establishing connection...',
    isCancelling = false,
    oncancel,
  }: Props = $props();
</script>

<div class="modal-overlay connection-progress-overlay" data-testid="connection-progress-overlay">
  <div class="modal connection-progress-modal" data-testid="connection-progress-modal">
    <div class="modal-header">
      <h2>Connecting to "{connectionName}"</h2>
    </div>

    <div class="modal-content">
      <div class="status-row">
        <Spinner size="md" />
        <p>{status}</p>
      </div>
    </div>

    <div class="modal-footer">
      <button class="cancel-btn" onclick={oncancel} disabled={isCancelling}>
        {#if isCancelling}Cancelling...{:else}Cancel{/if}
      </button>
    </div>
  </div>
</div>

<style>
  .connection-progress-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
    z-index: var(--z-modal-backdrop);
  }

  .connection-progress-modal {
    width: min(420px, calc(100vw - 2 * var(--space-xl)));
    padding: 0;
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
    z-index: var(--z-modal);
  }

  .modal-header,
  .modal-content,
  .modal-footer {
    padding-left: var(--space-lg);
    padding-right: var(--space-lg);
  }

  .modal-header {
    padding-top: var(--space-lg);
    padding-bottom: var(--space-sm);
  }

  .modal-header h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    color: var(--color-text-primary);
  }

  .modal-content {
    padding-top: var(--space-sm);
    padding-bottom: var(--space-md);
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--color-text-secondary);
  }

  .status-row p {
    margin: 0;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: 0;
    padding-bottom: var(--space-lg);
  }

  .cancel-btn {
    padding: var(--space-xs) var(--space-md);
    color: var(--color-text-secondary);
    background: none;
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .cancel-btn:hover:not(:disabled) {
    color: var(--color-text-primary);
    border-color: var(--color-text-secondary);
    background: var(--color-bg-hover);
  }

  .cancel-btn:disabled {
    opacity: 0.7;
    cursor: default;
  }
</style>
