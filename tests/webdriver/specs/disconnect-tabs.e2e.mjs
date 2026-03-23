import { expect } from 'expect-webdriverio';
import { connectToServer, createConnection, openContextMenuOnElement, resetApp, s } from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB_A = 'e2e_disconnect_tabs_a';
const TEST_DB_B = 'e2e_disconnect_tabs_b';
const COLLECTION_A = 'users';
const COLLECTION_B = 'orders';

describe('Disconnect Tab Cleanup', () => {
  let runtime;

  before(async () => {
    runtime = await readRuntimeInfo();
  });

  beforeEach(async () => {
    await cleanupDatabase(TEST_DB_A);
    await cleanupDatabase(TEST_DB_B);
    await resetApp();
  });

  afterEach(async () => {
    await cleanupDatabase(TEST_DB_A);
    await cleanupDatabase(TEST_DB_B);
  });

  function quoteXPath(text) {
    if (!text.includes("'")) {
      return `'${text}'`;
    }
    return `concat('${text.split("'").join(`', "'", '`)}')`;
  }

  async function connectionTreeItem(connectionName, label) {
    return await $(
      `//div[contains(@class, "connection-tree-item")][.//*[@role="treeitem"][contains(normalize-space(.), ${quoteXPath(connectionName)})]]//*[@role="treeitem"][contains(normalize-space(.), ${quoteXPath(label)})]`
    );
  }

  async function expandTreeNodeWithinConnection(connectionName, label) {
    const item = await connectionTreeItem(connectionName, label);
    const currentState = await item.getAttribute('aria-expanded');
    if (currentState === 'true') {
      return;
    }
    const chevron = await item.$('.chevron');
    await chevron.click();
    await browser.waitUntil(async () => (await item.getAttribute('aria-expanded')) === 'true', {
      timeout: 10_000,
      timeoutMsg: `Tree node ${label} under ${connectionName} did not expand`,
    });
  }

  async function openCollectionTab(connectionName, database, collection) {
    await connectToServer(connectionName);
    await expect(await connectionTreeItem(connectionName, database)).toBeDisplayed();
    await expandTreeNodeWithinConnection(connectionName, database);
    await expect(await connectionTreeItem(connectionName, 'Collections')).toBeDisplayed();
    await expandTreeNodeWithinConnection(connectionName, 'Collections');
    await expect(await connectionTreeItem(connectionName, collection)).toBeDisplayed();
    await (await connectionTreeItem(connectionName, collection)).click();
  }

  it('closes only tabs for the disconnected connection', async () => {
    await seedDatabase(TEST_DB_A, COLLECTION_A, [{ name: 'Alice' }]);
    await seedDatabase(TEST_DB_B, COLLECTION_B, [{ item: 'Widget' }]);

    await createConnection({
      name: 'Disconnect A',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });
    await createConnection({
      name: 'Disconnect B',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });

    await openCollectionTab('Disconnect A', TEST_DB_A, COLLECTION_A);
    await openCollectionTab('Disconnect B', TEST_DB_B, COLLECTION_B);

    await expect(s.tabs.tab(COLLECTION_A)).toBeDisplayed();
    await expect(s.tabs.tab(COLLECTION_B)).toBeDisplayed();

    await openContextMenuOnElement(await s.sidebar.treeItem('Disconnect A'));
    await (await s.contextMenu.item('Disconnect')).click();

    await expect(s.tabs.tab(COLLECTION_A)).not.toExist();
    await expect(s.tabs.tab(COLLECTION_B)).toBeDisplayed();
    await expect(s.tabs.activeTab()).toHaveText(expect.stringContaining(COLLECTION_B));
  });
});
