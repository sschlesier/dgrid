import { expect } from 'expect-webdriverio';
import {
  clearAndTypeQuery,
  connectToServer,
  createConnection,
  expandTreeNode,
  resetApp,
  s,
} from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB = 'e2e_tabs_test';

describe('Tab Management', () => {
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

  async function openCollection(collection) {
    await createConnection({
      name: 'TabTest',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });
    await connectToServer('TabTest');
    await expect(await s.sidebar.treeItem(TEST_DB)).toBeDisplayed();
    await expandTreeNode(TEST_DB);
    await expect(await s.sidebar.treeItem('Collections')).toBeDisplayed();
    await expandTreeNode('Collections');
    await expect(await s.sidebar.treeItem(collection)).toBeDisplayed();
    await (await s.sidebar.treeItem(collection)).click();
  }

  it('clicking a collection creates an active tab', async () => {
    await seedDatabase(TEST_DB, 'users', [{ name: 'Alice' }]);

    await openCollection('users');

    await expect(await s.tabs.bar()).toBeDisplayed();
    await expect(await s.tabs.activeTab()).toHaveText(expect.stringContaining('users'));
    await expect(await s.tabs.activeTab()).toHaveText(expect.stringContaining(TEST_DB));
  });

  it('opens multiple tabs for different collections', async () => {
    await seedDatabase(TEST_DB, 'users', [{ name: 'Alice' }]);
    await seedDatabase(TEST_DB, 'orders', [{ item: 'Widget' }]);

    await openCollection('users');
    await expect(await s.sidebar.treeItem('orders')).toBeDisplayed();
    await (await s.sidebar.treeItem('orders')).click();

    await expect(await s.tabs.tab('users')).toBeDisplayed();
    await expect(await s.tabs.tab('orders')).toBeDisplayed();
    await expect(await s.tabs.all()).toBeElementsArrayOfSize(2);
  });

  it('closes a tab without affecting the remaining tab', async () => {
    await seedDatabase(TEST_DB, 'users', [{ name: 'Alice' }]);
    await seedDatabase(TEST_DB, 'orders', [{ item: 'Widget' }]);

    await openCollection('users');
    await (await s.sidebar.treeItem('orders')).click();

    const closeButton = await s.tabs.closeButton('orders');
    await closeButton.moveTo();
    await closeButton.click();

    await expect(await s.tabs.tab('orders')).not.toExist();
    await expect(await s.tabs.tab('users')).toBeDisplayed();
    await expect(await s.tabs.activeTab()).toHaveText(expect.stringContaining('users'));
  });

  it('maintains independent query text in each tab', async () => {
    await seedDatabase(TEST_DB, 'users', [{ name: 'Alice' }]);
    await seedDatabase(TEST_DB, 'orders', [{ item: 'Widget' }]);

    await openCollection('users');
    await clearAndTypeQuery('db.users.find({ name: "Alice" })');

    await (await s.sidebar.treeItem('orders')).click();
    await clearAndTypeQuery('db.orders.find({})');

    await (await s.tabs.tab('users')).click();
    await expect(await s.query.editorContent()).toHaveText(expect.stringContaining('db.users.find'));

    await (await s.tabs.tab('orders')).click();
    await expect(await s.query.editorContent()).toHaveText(
      expect.stringContaining('db.orders.find')
    );
  });
});
