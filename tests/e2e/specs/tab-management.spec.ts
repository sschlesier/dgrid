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

const TEST_DB = 'e2e_tabs_test';

test.describe('Tab Management', () => {
  test.beforeEach(async ({ request, mongoInfo }) => {
    await deleteAllConnections(request);
    await cleanupDatabase(mongoInfo, TEST_DB);
  });

  test.afterEach(async ({ request, mongoInfo }) => {
    await cleanupDatabase(mongoInfo, TEST_DB);
    await deleteAllConnections(request);
  });

  test('click collection creates a tab', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, 'users', [{ name: 'Alice' }]);

    await page.goto('/');
    await createConnection(page, { name: 'TabTest', host: mongoInfo.host, port: mongoInfo.port });
    await connectToServer(page, 'TabTest');

    await expandTreeNode(page, TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
    await expandTreeNode(page, 'Collections');
    await expect(s.sidebar.treeItem('users')).toBeVisible({ timeout: 10_000 });
    await s.sidebar.treeItem('users').click();

    // Tab bar should be visible with an active tab
    await expect(s.tabs.bar()).toBeVisible();
    await expect(s.tabs.activeTab()).toBeVisible();
    // The tab should show the database name
    await expect(s.tabs.activeTab()).toContainText(TEST_DB);
  });

  test('open multiple tabs for different collections', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, 'users', [{ name: 'Alice' }]);
    await seedDatabase(mongoInfo, TEST_DB, 'orders', [{ item: 'Widget' }]);

    await page.goto('/');
    await createConnection(page, { name: 'TabTest', host: mongoInfo.host, port: mongoInfo.port });
    await connectToServer(page, 'TabTest');

    await expandTreeNode(page, TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
    await expandTreeNode(page, 'Collections');

    // Open first collection
    await expect(s.sidebar.treeItem('users')).toBeVisible({ timeout: 10_000 });
    await s.sidebar.treeItem('users').click();

    // Open second collection
    await expect(s.sidebar.treeItem('orders')).toBeVisible();
    await s.sidebar.treeItem('orders').click();

    // Both tabs should be visible
    await expect(s.tabs.tab('users')).toBeVisible();
    await expect(s.tabs.tab('orders')).toBeVisible();
  });

  test('close a tab', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, 'users', [{ name: 'Alice' }]);
    await seedDatabase(mongoInfo, TEST_DB, 'orders', [{ item: 'Widget' }]);

    await page.goto('/');
    await createConnection(page, { name: 'TabTest', host: mongoInfo.host, port: mongoInfo.port });
    await connectToServer(page, 'TabTest');

    await expandTreeNode(page, TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
    await expandTreeNode(page, 'Collections');

    await s.sidebar.treeItem('users').click();
    await s.sidebar.treeItem('orders').click();

    // Both tabs should be visible
    await expect(s.tabs.tab('users')).toBeVisible();
    await expect(s.tabs.tab('orders')).toBeVisible();

    // Close the orders tab (hover to reveal close button, then click)
    await s.tabs.tab('orders').hover();
    await s.tabs.closeButton('orders').click();

    // Orders tab should be gone
    await expect(s.tabs.tab('orders')).not.toBeVisible();
    // Users tab should still exist
    await expect(s.tabs.tab('users')).toBeVisible();
  });

  test('tabs maintain independent query state', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, 'users', [{ name: 'Alice' }]);
    await seedDatabase(mongoInfo, TEST_DB, 'orders', [{ item: 'Widget' }]);

    await page.goto('/');
    await createConnection(page, { name: 'TabTest', host: mongoInfo.host, port: mongoInfo.port });
    await connectToServer(page, 'TabTest');

    await expandTreeNode(page, TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
    await expandTreeNode(page, 'Collections');

    // Open users tab and type a query
    await s.sidebar.treeItem('users').click();
    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type('db.users.find({name: "Alice"})');

    // Open orders tab and type a different query
    await s.sidebar.treeItem('orders').click();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type('db.orders.find({})');

    // Switch back to users tab
    await s.tabs.tab('users').click();

    // The editor should still have the users query
    await expect(s.query.editorContent()).toContainText('db.users.find');
  });
});
