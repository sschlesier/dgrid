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
  import './styles/global.css';

  // Dialog state
  let showConnectionDialog = $state(false);
  let editingConnectionId = $state<string | null>(null);

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
      <Sidebar onEditConnection={openEditConnectionDialog} />
    {/if}

    <div class="content">
      {#if appStore.tabs.length > 0}
        <TabBar />
        {#if appStore.activeTab}
          <QueryPanel tab={appStore.activeTab} />
        {/if}
      {:else}
        <div class="empty-state">
          <div class="empty-state-content">
            <h2>No Query Tabs Open</h2>
            <p>
              {#if appStore.activeConnection?.isConnected}
                Click "New Tab" to start querying
              {:else if appStore.connections.length > 0}
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
