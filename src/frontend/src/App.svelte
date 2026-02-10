<script lang="ts">
  import { onMount } from 'svelte';
  import { appStore } from './stores/app.svelte';
  import Header from './components/Header.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import TabBar from './components/TabBar.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import QueryPanel from './components/QueryPanel.svelte';
  import Notification from './components/Notification.svelte';
  import ConnectionDialog from './components/ConnectionDialog.svelte';
  import PasswordPromptDialog from './components/PasswordPromptDialog.svelte';
  import './styles/global.css';

  // Dialog state
  let showConnectionDialog = $state(false);
  let editingConnectionId = $state<string | null>(null);

  // Password prompt state
  let showPasswordPrompt = $state(false);
  let promptConnectionId = $state<string | null>(null);
  let promptConnectionName = $state('');
  let promptUsername = $state('');

  function openNewConnectionDialog() {
    editingConnectionId = null;
    showConnectionDialog = true;
  }

  function openEditConnectionDialog(id: string) {
    editingConnectionId = id;
    showConnectionDialog = true;
  }

  function closeConnectionDialog() {
    showConnectionDialog = false;
    editingConnectionId = null;
  }

  async function handleConnect(id: string): Promise<void> {
    const connection = appStore.connections.find((c) => c.id === id);
    if (!connection) return;

    if (connection.username && !connection.savePassword) {
      // Need to prompt for password
      promptConnectionId = id;
      promptConnectionName = connection.name;
      promptUsername = connection.username;
      showPasswordPrompt = true;
      return;
    }

    await appStore.connect(id);
  }

  async function handlePasswordSubmit(password: string, rememberPassword: boolean): Promise<void> {
    const id = promptConnectionId;
    showPasswordPrompt = false;
    promptConnectionId = null;

    if (!id) return;

    await appStore.connect(id, password, rememberPassword || undefined);
  }

  function closePasswordPrompt() {
    showPasswordPrompt = false;
    promptConnectionId = null;
  }

  onMount(() => {
    // Apply initial theme
    appStore.applyTheme();

    // Watch for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (appStore.ui.theme === 'system') {
        appStore.applyTheme();
      }
    };
    mediaQuery.addEventListener('change', handleChange);

    // Load connections
    appStore.loadConnections();

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  });
</script>

<div class="app">
  <Header onNewConnection={openNewConnectionDialog} />

  <div class="main">
    {#if appStore.ui.sidebarOpen}
      <Sidebar onEditConnection={openEditConnectionDialog} onConnect={handleConnect} />
    {/if}

    <div class="content">
      {#if appStore.activeConnection?.isConnected}
        <TabBar />
        {#if appStore.activeTab}
          {#key appStore.activeTab.id}
            <QueryPanel tab={appStore.activeTab} />
          {/key}
        {:else}
          <div class="empty-state">
            <div class="empty-state-content">
              <h2>No Query Tabs Open</h2>
              <p>Click the + button above or press Cmd+T to start querying</p>
            </div>
          </div>
        {/if}
      {:else}
        <div class="empty-state">
          <div class="empty-state-content">
            <h2>No Query Tabs Open</h2>
            <p>
              {#if appStore.connections.length > 0}
                Connect to a database to start querying
              {:else}
                Create a connection to get started
              {/if}
            </p>
            {#if appStore.connections.length === 0}
              <button class="primary-btn" onclick={openNewConnectionDialog}>
                New Connection
              </button>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>

  <StatusBar />

  <!-- Notifications -->
  <div class="notifications">
    {#each appStore.notifications as notification (notification.id)}
      <Notification {notification} />
    {/each}
  </div>

  <!-- Connection Dialog -->
  {#if showConnectionDialog}
    <ConnectionDialog connectionId={editingConnectionId} onClose={closeConnectionDialog} />
  {/if}

  <!-- Password Prompt Dialog -->
  {#if showPasswordPrompt}
    <PasswordPromptDialog
      connectionName={promptConnectionName}
      username={promptUsername}
      onSubmit={handlePasswordSubmit}
      onClose={closePasswordPrompt}
    />
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: var(--color-bg-primary);
  }

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
  }

  .empty-state-content {
    text-align: center;
    color: var(--color-text-secondary);
  }

  .empty-state-content h2 {
    margin-bottom: var(--space-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-xl);
  }

  .empty-state-content p {
    margin-bottom: var(--space-lg);
  }

  .primary-btn {
    padding: var(--space-sm) var(--space-lg);
    background-color: var(--color-primary);
    color: var(--color-primary-text);
    border-radius: var(--radius-md);
    font-weight: var(--font-weight-medium);
    transition: background-color var(--transition-fast);
  }

  .primary-btn:hover {
    background-color: var(--color-primary-hover);
  }

  .notifications {
    position: fixed;
    bottom: calc(var(--statusbar-height) + var(--space-md));
    right: var(--space-md);
    display: flex;
    flex-direction: column-reverse;
    gap: var(--space-sm);
    z-index: var(--z-notification);
  }
</style>
