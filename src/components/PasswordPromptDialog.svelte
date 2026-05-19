<script lang="ts">
  interface Props {
    connectionName: string;
    username: string;
    showRemember?: boolean;
    submitLabel?: string;
    onSubmit: (_password: string, _savePassword: boolean) => void;
    onClose: () => void;
  }

  let {
    connectionName,
    username,
    showRemember = true,
    submitLabel = 'Connect',
    onSubmit,
    onClose,
  }: Props = $props();

  let password = $state('');
  let savePassword = $state(false);
  let inputRef = $state<HTMLInputElement | undefined>();

  $effect(() => {
    if (inputRef) {
      requestAnimationFrame(() => inputRef?.focus());
    }
  });

  function handleConnect() {
    onSubmit(password, savePassword);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose();
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      handleConnect();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dialog-overlay" onclick={onClose} data-testid="password-prompt-overlay">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <div class="dialog-header">
      <h2>Password Required</h2>
      <button class="close-btn" onclick={onClose} title="Close">
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
      <p class="prompt-message">
        Enter password for <strong>{connectionName}</strong> (user: <code>{username}</code>)
      </p>

      <div class="form-group">
        <label for="prompt-password">Password</label>
        <input
          id="prompt-password"
          type="password"
          bind:value={password}
          bind:this={inputRef}
          data-testid="password-prompt-input"
        />
      </div>

      {#if showRemember}
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="checkbox-group">
          <input
            type="checkbox"
            bind:checked={savePassword}
            data-testid="password-prompt-remember"
          />
          Remember password
        </label>
      {/if}
    </div>

    <div class="dialog-footer">
      <div class="footer-right">
        <button
          type="button"
          class="cancel-btn"
          onclick={onClose}
          data-testid="password-prompt-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          class="connect-btn"
          onclick={handleConnect}
          data-testid="password-prompt-connect"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .dialog {
    max-width: 420px;
  }

  .prompt-message {
    margin-bottom: var(--space-md);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .prompt-message code {
    font-family: var(--font-mono);
    background-color: var(--color-bg-secondary);
    padding: 1px 4px;
    border-radius: var(--radius-sm);
  }

  .form-group input[type='password'] {
    width: 100%;
    padding: var(--space-sm);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    font-size: var(--font-size-md);
    color: var(--color-text-primary);
  }

  .form-group input[type='password']:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .checkbox-group {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .connect-btn {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
    border: 1px solid var(--color-primary);
  }

  .connect-btn:hover {
    background-color: var(--color-primary-hover);
  }
</style>
