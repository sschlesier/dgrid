import { expect } from 'expect-webdriverio';
import {
  createConnection,
  expandTreeNode,
  openContextMenuOnElement,
  resetApp,
  s,
} from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB = 'e2e_ctx_menu_test';
const TEST_COLLECTION = 'users';

describe('Sidebar Context Menu', () => {
  let runtime;

  before(async () => {
    runtime = await readRuntimeInfo();
  });

  beforeEach(async () => {
    await cleanupDatabase(TEST_DB);
    await resetApp();
  });

  afterEach(async () => {
    await cleanupDatabase(TEST_DB);
  });

  async function createSidebarConnection(name = `CtxTest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`) {
    await createConnection({
      name,
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });
    return name;
  }

  async function createConnectedSidebarConnection() {
    await seedDatabase(TEST_DB, TEST_COLLECTION, [{ name: 'Alice' }]);
    const connectionName = await createSidebarConnection();
    const connectionItem = await s.sidebar.treeItem(connectionName);
    await connectionItem.click();
    await browser.waitUntil(async () => (await connectionItem.getAttribute('aria-expanded')) === 'true', {
      timeout: 10_000,
      timeoutMsg: `Connection ${connectionName} did not expand`,
    });
    await expect(s.sidebar.treeItem(TEST_DB)).toBeDisplayed();
    return connectionName;
  }

  async function getMenuLabels() {
    return await browser.execute(() =>
      Array.from(document.querySelectorAll('.context-menu .context-menu-item')).map((button) =>
        button.textContent?.trim()
      )
    );
  }

  it('shows Connect, Edit Connection, and Delete Connection for a disconnected connection', async () => {
    const connectionName = await createSidebarConnection();

    await openContextMenuOnElement(await s.sidebar.treeItem(connectionName));

    const labels = await getMenuLabels();
    expect(labels).toContain('Connect');
    expect(labels).toContain('Edit Connection');
    expect(labels).toContain('Delete Connection');
  });

  it('connects via the context menu', async () => {
    await seedDatabase(TEST_DB, TEST_COLLECTION, [{ name: 'Alice' }]);
    const connectionName = await createSidebarConnection();

    const connectionItem = await s.sidebar.treeItem(connectionName);
    await openContextMenuOnElement(connectionItem);
    await (await s.contextMenu.item('Connect')).click();

    await browser.waitUntil(async () => (await connectionItem.getAttribute('aria-expanded')) === 'true', {
      timeout: 10_000,
      timeoutMsg: `Connection ${connectionName} did not expand after context-menu connect`,
    });
    await expect(s.sidebar.treeItem(TEST_DB)).toBeDisplayed();
  });

  it('opens the edit dialog from the context menu', async () => {
    const connectionName = await createSidebarConnection();

    await openContextMenuOnElement(await s.sidebar.treeItem(connectionName));
    await (await s.contextMenu.item('Edit Connection')).click();

    await expect(s.connectionDialog.overlay()).toBeDisplayed();
    await expect(s.connectionDialog.heading()).toHaveText('Edit Connection');
  });

  it('deletes a disconnected connection from the context menu', async () => {
    const connectionName = await createSidebarConnection();

    await openContextMenuOnElement(await s.sidebar.treeItem(connectionName));
    await browser.execute(() => {
      window.confirm = () => true;
    });
    await (await s.contextMenu.item('Delete Connection')).click();

    await expect(s.sidebar.treeItem(connectionName)).not.toExist();
    await expect(s.sidebar.emptyState()).toBeDisplayed();
  });

  it('shows Refresh, Edit, Disconnect, and Delete for a connected connection', async () => {
    const connectionName = await createConnectedSidebarConnection();

    await openContextMenuOnElement(await s.sidebar.treeItem(connectionName));

    const labels = await getMenuLabels();
    expect(labels).toContain('Refresh');
    expect(labels).toContain('Edit Connection');
    expect(labels).toContain('Disconnect');
    expect(labels).toContain('Delete Connection');
    await expect(s.contextMenu.separator()).toBeDisplayed();
  });

  it('disconnects from the server via the context menu', async () => {
    const connectionName = await createConnectedSidebarConnection();

    await openContextMenuOnElement(await s.sidebar.treeItem(connectionName));
    await (await s.contextMenu.item('Disconnect')).click();

    await expect(s.sidebar.treeItem(TEST_DB)).not.toExist();
  });

  it('deletes a connected connection and uses the combined confirmation message', async () => {
    const connectionName = await createConnectedSidebarConnection();

    await openContextMenuOnElement(await s.sidebar.treeItem(connectionName));
    const confirmMessage = await browser.execute(() => {
      let captured = '';
      window.confirm = (message) => {
        captured = String(message);
        return true;
      };
      window.__dgridCapturedConfirmMessage = () => captured;
      return true;
    });
    expect(confirmMessage).toBe(true);
    await (await s.contextMenu.item('Delete Connection')).click();

    const dialogMessage = await browser.execute(() =>
      window.__dgridCapturedConfirmMessage ? window.__dgridCapturedConfirmMessage() : ''
    );
    expect(dialogMessage).toContain('Disconnect and delete');
    await expect(s.sidebar.treeItem(connectionName)).not.toExist();
  });

  it('shows Refresh Collections for a database node', async () => {
    await createConnectedSidebarConnection();

    await openContextMenuOnElement(await s.sidebar.treeItem(TEST_DB));

    await expect(s.contextMenu.item('Refresh Collections')).toBeDisplayed();
  });

  it('shows Open in New Tab and Copy Collection Name for a collection node', async () => {
    await createConnectedSidebarConnection();
    await expandTreeNode(TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeDisplayed();
    await expandTreeNode('Collections');
    await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeDisplayed();

    await openContextMenuOnElement(await s.sidebar.treeItem(TEST_COLLECTION));

    await expect(s.contextMenu.item('Open in New Tab')).toBeDisplayed();
    await expect(s.contextMenu.item('Copy Collection Name')).toBeDisplayed();
  });

  it('opens a tab from the collection context menu', async () => {
    await createConnectedSidebarConnection();
    await expandTreeNode(TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeDisplayed();
    await expandTreeNode('Collections');
    await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeDisplayed();

    await openContextMenuOnElement(await s.sidebar.treeItem(TEST_COLLECTION));
    await (await s.contextMenu.item('Open in New Tab')).click();

    await expect(s.tabs.bar()).toBeDisplayed();
    await expect(s.tabs.activeTab()).toBeDisplayed();
    await expect(s.query.editorContainer()).toBeDisplayed();
  });

  it('closes the context menu when clicking elsewhere', async () => {
    const connectionName = await createSidebarConnection();

    await openContextMenuOnElement(await s.sidebar.treeItem(connectionName));
    await expect(s.contextMenu.menu()).toBeDisplayed();

    await browser.execute(() => {
      document.querySelector('.context-menu-backdrop')?.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          composed: true,
        })
      );
    });
    await expect(s.contextMenu.menu()).not.toBeDisplayed();
  });

  it('closes the context menu when pressing Escape', async () => {
    const connectionName = await createSidebarConnection();

    await openContextMenuOnElement(await s.sidebar.treeItem(connectionName));
    await expect(s.contextMenu.menu()).toBeDisplayed();

    await browser.execute(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
          composed: true,
        })
      );
    });
    await expect(s.contextMenu.menu()).not.toBeDisplayed();
  });
});
