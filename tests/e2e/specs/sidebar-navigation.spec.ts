import {
  test,
  expect,
  createConnection,
  connectToServer,
  deleteAllConnections,
  seedDatabase,
  cleanupDatabase,
  expandTreeNode,
} from '../fixtures';

const TEST_DB = 'e2e_sidebar_test';
const TEST_COLLECTION = 'items';

test.describe('Sidebar Navigation', () => {
  test.beforeEach(async ({ request, mongoInfo }) => {
    await deleteAllConnections(request);
    await cleanupDatabase(mongoInfo, TEST_DB);
  });

  test.afterEach(async ({ request, mongoInfo }) => {
    await cleanupDatabase(mongoInfo, TEST_DB);
    await deleteAllConnections(request);
  });

  test('expand database to see collections', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Item 1' }]);

    await page.goto('/');
    await createConnection(page, {
      name: 'SidebarTest',
      host: mongoInfo.host,
      port: mongoInfo.port,
    });
    await connectToServer(page, 'SidebarTest');

    // Database should be visible
    await expect(s.sidebar.treeItem(TEST_DB)).toBeVisible({ timeout: 10_000 });

    // Expand database to see "Collections" group
    await expandTreeNode(page, TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });

    // Expand "Collections" to see the collection
    await expandTreeNode(page, 'Collections');
    await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeVisible({ timeout: 10_000 });
  });

  test('click collection opens query tab', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Item 1' }]);

    await page.goto('/');
    await createConnection(page, {
      name: 'SidebarTest',
      host: mongoInfo.host,
      port: mongoInfo.port,
    });
    await connectToServer(page, 'SidebarTest');

    await expandTreeNode(page, TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
    await expandTreeNode(page, 'Collections');
    await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeVisible({ timeout: 10_000 });

    // Click collection to open a tab
    await s.sidebar.treeItem(TEST_COLLECTION).click();

    // A tab should appear with the collection name
    await expect(s.tabs.bar()).toBeVisible();
    await expect(s.tabs.activeTab()).toBeVisible();
    // The editor should appear
    await expect(s.query.editor()).toBeVisible();
  });

  test('disconnect from server', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Item 1' }]);

    await page.goto('/');
    await createConnection(page, {
      name: 'SidebarTest',
      host: mongoInfo.host,
      port: mongoInfo.port,
    });
    await connectToServer(page, 'SidebarTest');

    // Should see databases
    await expect(s.sidebar.treeItem(TEST_DB)).toBeVisible({ timeout: 10_000 });

    // Click disconnect button
    await s.sidebar.actionButton('Disconnect').click();

    // Databases should no longer be visible (tree collapses)
    await expect(s.sidebar.treeItem(TEST_DB)).not.toBeVisible({ timeout: 5_000 });
  });

  test('refresh databases', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Item 1' }]);

    await page.goto('/');
    await createConnection(page, {
      name: 'SidebarTest',
      host: mongoInfo.host,
      port: mongoInfo.port,
    });
    await connectToServer(page, 'SidebarTest');

    // Should see databases
    await expect(s.sidebar.treeItem(TEST_DB)).toBeVisible({ timeout: 10_000 });

    // Click refresh button
    await s.sidebar.actionButton('Refresh databases').click();

    // Database should still be visible after refresh
    await expect(s.sidebar.treeItem(TEST_DB)).toBeVisible({ timeout: 10_000 });
  });
});
