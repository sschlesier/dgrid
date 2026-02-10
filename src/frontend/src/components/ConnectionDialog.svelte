<script lang="ts">
  import { appStore } from '../stores/app.svelte';
  import * as api from '../api/client';
  import Spinner from './Spinner.svelte';

  interface Props {
    connectionId: string | null;
    onClose: () => void;
  }

  let { connectionId, onClose }: Props = $props();

  // Tab state: 'form' or 'uri'
  let activeTab = $state<'form' | 'uri'>('form');

  // Form state
  let name = $state('');
  let isSrv = $state(false);
  let host = $state('localhost');
  let port = $state(27017);
  let database = $state('');
  let tls = $state(false);
  let username = $state('');
  let password = $state('');
  let authSource = $state('admin');

  // URI tab state
  let uriInput = $state('');

  // Save password preference
  let savePassword = $state(true);
  let hasSavedPassword = $state(false);

  // UI state
  let isLoading = $state(false);
  let isTesting = $state(false);
  let testResult = $state<{ success: boolean; message: string } | null>(null);
  let error = $state<string | null>(null);

  /** Parse a MongoDB URI into form fields. */
  function parseMongoUri(uri: string): {
    isSrv: boolean;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    authSource: string;
    tls: boolean;
  } {
    try {
      const parsed = new URL(uri);
      const parsedIsSrv = parsed.protocol === 'mongodb+srv:';
      return {
        isSrv: parsedIsSrv,
        host: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port) : 27017,
        database: parsed.pathname.slice(1) || '',
        username: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        authSource: parsed.searchParams.get('authSource') || '',
        tls: parsedIsSrv || parsed.searchParams.get('tls') === 'true',
      };
    } catch {
      return {
        isSrv: false,
        host: 'localhost',
        port: 27017,
        database: '',
        username: '',
        password: '',
        authSource: '',
        tls: false,
      };
    }
  }

  /** Build a MongoDB URI from form fields. */
  function buildMongoUri(): string {
    const scheme = isSrv ? 'mongodb+srv://' : 'mongodb://';
    let uri = scheme;
    if (username) {
      uri += encodeURIComponent(username);
      if (password) uri += ':' + encodeURIComponent(password);
      uri += '@';
    }
    uri += host;
    if (!isSrv && port) uri += ':' + port;
    if (database) uri += '/' + database;
    const params = new URLSearchParams();
    if (authSource && username) params.set('authSource', authSource);
    if (tls && !isSrv) params.set('tls', 'true');
    const qs = params.toString();
    if (qs) uri += (database ? '?' : '/?') + qs;
    return uri;
  }

  // Live URI preview for Form tab
  let uriPreview = $derived(buildMongoUri());

  // Load existing connection data if editing
  $effect(() => {
    if (connectionId) {
      const connection = appStore.connections.find((c) => c.id === connectionId);
      if (connection) {
        name = connection.name;
        savePassword = connection.savePassword ?? true;
        // Parse the stored URI into form fields
        if (connection.uri) {
          const parsed = parseMongoUri(connection.uri);
          isSrv = parsed.isSrv;
          host = parsed.host;
          port = parsed.port;
          database = parsed.database;
          tls = parsed.tls;
          username = connection.username || parsed.username || '';
          authSource = parsed.authSource || 'admin';
          uriInput = connection.uri;
        }
        // Password is not returned from API for security
        password = '';
        hasSavedPassword = !!(connection.username && connection.savePassword);
      }
    }
  });

  function isValid(): boolean {
    if (name.trim() === '') return false;
    if (activeTab === 'uri') {
      return (
        uriInput.trim().startsWith('mongodb://') || uriInput.trim().startsWith('mongodb+srv://')
      );
    }
    // Form tab validation
    if (host.trim() === '') return false;
    if (!isSrv && (port < 1 || port > 65535)) return false;
    return true;
  }

  /** Get the final URI to send to the backend (both tabs). */
  function getFinalUri(): string {
    if (activeTab === 'uri') return uriInput.trim();
    return buildMongoUri();
  }

  /** Sync form → URI when switching to URI tab. */
  function switchToUri() {
    uriInput = buildMongoUri();
    activeTab = 'uri';
  }

  /** Sync URI → form when switching to Form tab. */
  function switchToForm() {
    if (uriInput.trim()) {
      const parsed = parseMongoUri(uriInput);
      isSrv = parsed.isSrv;
      host = parsed.host;
      port = parsed.port;
      database = parsed.database;
      username = parsed.username;
      password = parsed.password;
      authSource = parsed.authSource || 'admin';
      tls = parsed.tls;
    }
    activeTab = 'form';
  }

  async function handleTest() {
    if (!isValid()) return;

    isTesting = true;
    testResult = null;
    error = null;

    try {
      const result = await api.testConnection({
        uri: getFinalUri(),
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

    const uri = getFinalUri();

    // Warn if URI has a password but savePassword is unchecked
    if (!savePassword) {
      const parsed = parseMongoUri(uri);
      if (parsed.password) {
        const confirmed = confirm(
          'The password will not be saved. You\u2019ll be prompted each time you connect. Continue?'
        );
        if (!confirmed) return;
      }
    }

    isLoading = true;
    error = null;

    try {
      if (connectionId) {
        await appStore.updateConnection(connectionId, {
          name: name.trim(),
          uri,
          savePassword,
        });
      } else {
        await appStore.createConnection({
          name: name.trim(),
          uri,
          savePassword,
        });
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

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="dialog-overlay" data-testid="connection-dialog-overlay" onclick={onClose}>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
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

      <!-- Tab switcher -->
      <div class="tab-bar" role="tablist">
        <button
          type="button"
          role="tab"
          class="tab-btn"
          class:active={activeTab === 'form'}
          aria-selected={activeTab === 'form'}
          data-testid="form-tab"
          onclick={switchToForm}
        >
          Form
        </button>
        <button
          type="button"
          role="tab"
          class="tab-btn"
          class:active={activeTab === 'uri'}
          aria-selected={activeTab === 'uri'}
          data-testid="uri-tab"
          onclick={switchToUri}
        >
          URI
        </button>
      </div>

      {#if activeTab === 'form'}
        <!-- Connection type toggle -->
        <div class="form-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>Connection Type</label>
          <div class="toggle-group" data-testid="srv-toggle">
            <button
              type="button"
              class="toggle-btn"
              class:active={!isSrv}
              onclick={() => {
                isSrv = false;
                tls = false;
              }}
            >
              Standard
            </button>
            <button
              type="button"
              class="toggle-btn"
              class:active={isSrv}
              onclick={() => {
                isSrv = true;
                tls = true;
              }}
            >
              SRV
            </button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group" class:flex-2={!isSrv} class:flex-1={isSrv}>
            <label for="host">Host *</label>
            <input
              id="host"
              type="text"
              bind:value={host}
              placeholder={isSrv ? 'cluster0.example.net' : 'localhost'}
              required
            />
          </div>
          {#if !isSrv}
            <div class="form-group flex-1">
              <label for="port">Port *</label>
              <input id="port" type="number" bind:value={port} min="1" max="65535" required />
            </div>
          {/if}
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

        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={tls} disabled={isSrv} data-testid="tls-checkbox" />
            TLS / SSL {isSrv ? '(required for SRV)' : ''}
          </label>
        </div>

        <div class="form-divider">Authentication</div>

        <div class="form-row">
          <div class="form-group flex-1">
            <label for="username">Username</label>
            <input id="username" type="text" bind:value={username} placeholder="(optional)" />
          </div>
          <div class="form-group flex-1">
            <label for="password">Password</label>
            <input
              id="password"
              type="password"
              bind:value={password}
              placeholder={hasSavedPassword ? '••••••••' : '(optional)'}
            />
          </div>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={savePassword}
              data-testid="save-password-checkbox"
            />
            Save password
          </label>
        </div>

        {#if username}
          <div class="form-group">
            <label for="authSource">Auth Source</label>
            <input id="authSource" type="text" bind:value={authSource} placeholder="admin" />
          </div>
        {/if}

        <!-- URI Preview -->
        <div class="uri-preview" data-testid="uri-preview">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>URI Preview</label>
          <code>{uriPreview}</code>
        </div>
      {:else}
        <!-- URI Tab -->
        <div class="form-group">
          <label for="uri-input">Connection String *</label>
          <input
            id="uri-input"
            type="text"
            bind:value={uriInput}
            placeholder="mongodb+srv://user:password@cluster0.example.net/mydb"
            data-testid="uri-input"
          />
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={savePassword}
              data-testid="save-password-checkbox"
            />
            Save password
          </label>
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
          {#if isTesting}
            <Spinner size="sm" />
            Testing...
          {:else}
            Test Connection
          {/if}
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
          {#if isLoading}
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

  .form-group input[type='text'],
  .form-group input[type='number'],
  .form-group input[type='password'] {
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

  /* Tab bar */
  .tab-bar {
    display: flex;
    gap: 0;
    margin-bottom: var(--space-md);
    border-bottom: 1px solid var(--color-border-light);
  }

  .tab-btn {
    padding: var(--space-xs) var(--space-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    background-color: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tab-btn.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
  }

  .tab-btn:hover:not(.active) {
    color: var(--color-text-primary);
  }

  /* Toggle group (Standard / SRV) */
  .toggle-group {
    display: flex;
    gap: 0;
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .toggle-btn {
    flex: 1;
    padding: var(--space-xs) var(--space-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    background-color: transparent;
    border: none;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .toggle-btn:not(:last-child) {
    border-right: 1px solid var(--color-border-medium);
  }

  .toggle-btn.active {
    background-color: var(--color-primary);
    color: var(--color-primary-text);
  }

  .toggle-btn:hover:not(.active) {
    background-color: var(--color-bg-hover);
  }

  /* Checkbox */
  .checkbox-label {
    display: flex !important;
    align-items: center;
    gap: var(--space-xs);
    cursor: pointer;
  }

  .checkbox-label input[type='checkbox'] {
    width: auto;
  }

  /* URI Preview */
  .uri-preview {
    margin-top: var(--space-md);
    padding: var(--space-sm);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-md);
  }

  .uri-preview label {
    display: block;
    margin-bottom: var(--space-xs);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-muted);
  }

  .uri-preview code {
    display: block;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    word-break: break-all;
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
