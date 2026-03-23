import { expect } from 'expect-webdriverio';
import {
  clearAndTypeQuery,
  connectToServer,
  createConnection,
  dispatchShortcut,
  expandTreeNode,
  resetApp,
  s,
} from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB = 'e2e_tab_shortcuts_test';

describe('Tab Keyboard Shortcuts', () => {
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
    await connectToServer('ShortcutTest');
    await expect(s.sidebar.treeItem(TEST_DB)).toBeDisplayed();
    await expandTreeNode(TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeDisplayed();
    await expandTreeNode('Collections');
    await expect(s.sidebar.treeItem(collection)).toBeDisplayed();
    await (await s.sidebar.treeItem(collection)).click();
  }

  it('opens a new tab on the active tab database with Alt+T and closes it with Alt+W', async () => {
    await seedDatabase(TEST_DB, 'users', [{ name: 'Alice' }]);
    await seedDatabase(TEST_DB, 'orders', [{ item: 'Widget' }]);

    await createConnection({
      name: 'ShortcutTest',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });

    await openCollection('users');
    await clearAndTypeQuery('db.users.find({ name: "Alice" })');
    await (await s.sidebar.treeItem('orders')).click();
    await clearAndTypeQuery('db.orders.find({})');

    await (await s.tabs.tab('users')).click();
    await expect(s.tabs.activeTab()).toHaveText(expect.stringContaining(TEST_DB));
    await expect(s.query.editorContent()).toHaveText(expect.stringContaining('db.users.find'));

    await dispatchShortcut({ key: '†', code: 'KeyT', alt: true });

    await expect(s.tabs.all()).toBeElementsArrayOfSize(3);
    await expect(s.tabs.activeTab()).toHaveText(expect.stringContaining('New Query'));
    await expect(s.tabs.activeTab()).toHaveText(expect.stringContaining(TEST_DB));
    await expect(s.query.editorContent()).not.toHaveText(expect.stringContaining('db.users.find'));
    await expect(s.query.editorContent()).toHaveText(
      expect.stringContaining('Enter your MongoDB query here')
    );

    await dispatchShortcut({ key: '∑', code: 'KeyW', alt: true });

    await expect(s.tabs.all()).toBeElementsArrayOfSize(2);
    await expect(s.tabs.activeTab()).toHaveText(expect.stringContaining('orders'));
    await expect(s.query.editorContent()).toHaveText(expect.stringContaining('db.orders.find'));
    await expect(s.tabs.tab('users')).toBeDisplayed();
    await expect(s.tabs.tab('orders')).toBeDisplayed();
  });
});
