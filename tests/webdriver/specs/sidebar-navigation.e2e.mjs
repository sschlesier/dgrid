import { expect } from 'expect-webdriverio';
import {
  connectToServer,
  createConnection,
  expandTreeNode,
  resetApp,
  s,
} from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB = 'e2e_sidebar_test';
const TEST_COLLECTION = 'items';

describe('Sidebar Navigation', () => {
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

  async function connectSidebarTest() {
    await createConnection({
      name: 'SidebarTest',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });
    await connectToServer('SidebarTest');
    await expect(s.sidebar.treeItem(TEST_DB)).toBeDisplayed();
  }

  it('expands a database to show collections', async () => {
    await seedDatabase(TEST_DB, TEST_COLLECTION, [{ name: 'Item 1' }]);

    await connectSidebarTest();
    await expandTreeNode(TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeDisplayed();
    await expandTreeNode('Collections');
    await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeDisplayed();
  });

  it('disconnects from the server', async () => {
    await seedDatabase(TEST_DB, TEST_COLLECTION, [{ name: 'Item 1' }]);

    await connectSidebarTest();
    await (await s.sidebar.actionButton('Disconnect')).click();

    await expect(s.sidebar.treeItem(TEST_DB)).not.toExist();
  });

  it('refreshes databases without dropping the connection tree', async () => {
    await seedDatabase(TEST_DB, TEST_COLLECTION, [{ name: 'Item 1' }]);

    await connectSidebarTest();
    await (await s.sidebar.actionButton('Refresh databases')).click();

    await expect(s.sidebar.treeItem(TEST_DB)).toBeDisplayed();
  });
});
