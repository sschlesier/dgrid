<script lang="ts">
  import { appStore } from '../stores/app.svelte';
  import * as api from '../api/client';

  interface Props {
    connectionId: string | null;
    onClose: () => void;
  }

  let { connectionId, onClose }: Props = $props();

  // Form state
  let name = $state('');
  let host = $state('localhost');
  let port = $state(27017);
  let database = $state('');
  let username = $state('');
  let password = $state('');
  let authSource = $state('admin');

  // UI state
  let isLoading = $state(false);
  let isTesting = $state(false);
  let testResult = $state<{ success: boolean; message: string } | null>(null);
  let error = $state<string | null>(null);

  // Load existing connection data if editing
  $effect(() => {
    if (connectionId) {
      const connection = appStore.connections.find((c) => c.id === connectionId);
      if (connection) {
        name = connection.name;
        host = connection.host;
        port = connection.port;
        database = connection.database || '';
        username = connection.username || '';
        authSource = connection.authSource || 'admin';
        // Password is not returned from API for security
        password = '';
      }
    }
  });

  function isValid(): boolean {
    return name.trim() !== '' && host.trim() !== '' && port > 0 && port < 65536;
  }

  async function handleTest() {
    if (!isValid()) return;

    isTesting = true;
    testResult = null;
    error = null;

    try {
      const result = await api.testConnection({
        host,
        port,
        database: database || undefined,
        username: username || undefined,
        password: password || undefined,
        authSource: username ? authSource : undefined,
      });
      testResult = result;
    } catch (err) {
      testResult = {
        success: false,
        message: (err as Error).message,
      };
    } finally {
      isTesting = false;
    }
  }

  async function handleSave() {
    if (!isValid()) return;

    isLoading = true;
    error = null;

    try {
      const data = {
        name: name.trim(),
        host: host.trim(),
        port,
        database: database.trim() || undefined,
        username: username.trim() || undefined,
        password: password || undefined,
        authSource: username ? authSource : undefined,
      };

      if (connectionId) {
        await appStore.updateConnection(connectionId, data);
      } else {
        await appStore.createConnection(data);
      }

      onClose();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      isLoading = false;
    }
  }

  async function handleDelete() {
    if (!connectionId) return;

    if (!confirm('Are you sure you want to delete this connection?')) {
      return;
    }

    isLoading = true;
    try {
      await appStore.deleteConnection(connectionId);
      onClose();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      isLoading = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="dialog-overlay" onclick={onClose}>
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <div class="dialog-header">
      <h2>{connectionId ? 'Edit Connection' : 'New Connection'}</h2>
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

    <form
      class="dialog-content"
      onsubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      <div class="form-group">
        <label for="name">Name *</label>
        <input
          id="name"
          type="text"
          bind:value={name}
          placeholder="My MongoDB Connection"
          required
        />
      </div>

      <div class="form-row">
        <div class="form-group flex-2">
          <label for="host">Host *</label>
          <input id="host" type="text" bind:value={host} placeholder="localhost" required />
        </div>
        <div class="form-group flex-1">
          <label for="port">Port *</label>
          <input id="port" type="number" bind:value={port} min="1" max="65535" required />
        </div>
      </div>

      <div class="form-group">
        <label for="database">Database</label>
        <input
          id="database"
          type="text"
          bind:value={database}
          placeholder="(optional) Default database"
        />
      </div>

      <div class="form-divider">Authentication</div>

      <div class="form-row">
        <div class="form-group flex-1">
          <label for="username">Username</label>
          <input id="username" type="text" bind:value={username} placeholder="(optional)" />
        </div>
        <div class="form-group flex-1">
          <label for="password">Password</label>
          <input id="password" type="password" bind:value={password} placeholder="(optional)" />
        </div>
      </div>

      {#if username}
        <div class="form-group">
          <label for="authSource">Auth Source</label>
          <input id="authSource" type="text" bind:value={authSource} placeholder="admin" />
        </div>
      {/if}

      {#if error}
        <div class="error-message">{error}</div>
      {/if}

      {#if testResult}
        <div
          class="test-result"
          class:success={testResult.success}
          class:failure={!testResult.success}
        >
          {testResult.message}
        </div>
      {/if}
    </form>

    <div class="dialog-footer">
      {#if connectionId}
        <button type="button" class="delete-btn" onclick={handleDelete} disabled={isLoading}>
          Delete
        </button>
      {/if}

      <div class="footer-right">
        <button
          type="button"
          class="test-btn"
          onclick={handleTest}
          disabled={!isValid() || isTesting || isLoading}
        >
          {isTesting ? 'Testing...' : 'Test Connection'}
        </button>
        <button type="button" class="cancel-btn" onclick={onClose} disabled={isLoading}>
          Cancel
        </button>
        <button
          type="submit"
          class="save-btn"
          onclick={handleSave}
          disabled={!isValid() || isLoading}
        >
          {isLoading ? 'Saving...' : 'Save'}
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
    max-width: 500px;
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

  .form-group input {
    width: 100%;
    padding: var(--space-sm);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    font-size: var(--font-size-md);
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .form-row {
    display: flex;
    gap: var(--space-md);
  }

  .flex-1 {
    flex: 1;
  }

  .flex-2 {
    flex: 2;
  }

  .form-divider {
    margin: var(--space-lg) 0 var(--space-md);
    padding-bottom: var(--space-xs);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border-light);
  }

  .error-message {
    padding: var(--space-sm);
    background-color: var(--color-error-light);
    color: var(--color-error-text);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    margin-top: var(--space-md);
  }

  .test-result {
    padding: var(--space-sm);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    margin-top: var(--space-md);
  }

  .test-result.success {
    background-color: var(--color-success-light);
    color: var(--color-success-text);
  }

  .test-result.failure {
    background-color: var(--color-error-light);
    color: var(--color-error-text);
  }

  .dialog-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md) var(--space-lg);
    border-top: 1px solid var(--color-border-light);
    gap: var(--space-sm);
  }

  .footer-right {
    display: flex;
    gap: var(--space-sm);
    margin-left: auto;
  }

  .dialog-footer button {
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

  .delete-btn {
    background-color: transparent;
    color: var(--color-error);
    border: 1px solid var(--color-error);
  }

  .delete-btn:hover:not(:disabled) {
    background-color: var(--color-error-light);
  }

  .test-btn {
    background-color: transparent;
    border: 1px solid var(--color-border-medium);
  }

  .test-btn:hover:not(:disabled) {
    background-color: var(--color-bg-hover);
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
