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

const TEST_DB = 'e2e_ctx_menu_test';
const TEST_COLLECTION = 'users';

test.describe('Sidebar Context Menu', () => {
  test.beforeEach(async ({ request, mongoInfo }) => {
    await deleteAllConnections(request);
    await cleanupDatabase(mongoInfo, TEST_DB);
  });

  test.afterEach(async ({ request, mongoInfo }) => {
    await cleanupDatabase(mongoInfo, TEST_DB);
    await deleteAllConnections(request);
  });

  test.describe('Disconnected Connection', () => {
    test('shows Connect, Edit Connection, Delete Connection', async ({ page, s, mongoInfo }) => {
      await page.goto('/');
      await createConnection(page, {
        name: 'CtxTest',
        host: mongoInfo.host,
        port: mongoInfo.port,
      });

      // Right-click the disconnected connection
      await s.sidebar.treeItem('CtxTest').click({ button: 'right' });

      await expect(s.contextMenu.menu()).toBeVisible();
      await expect(s.contextMenu.item('Connect')).toBeVisible();
      await expect(s.contextMenu.item('Edit Connection')).toBeVisible();
      await expect(s.contextMenu.item('Delete Connection')).toBeVisible();
    });

    test('Connect via context menu connects to server', async ({ page, s, mongoInfo }) => {
      await page.goto('/');
      await createConnection(page, {
        name: 'CtxTest',
        host: mongoInfo.host,
        port: mongoInfo.port,
      });

      await s.sidebar.treeItem('CtxTest').click({ button: 'right' });
      await s.contextMenu.item('Connect').click();

      // Should connect and show databases
      await expect(s.sidebar.treeItem('CtxTest')).toHaveAttribute('aria-expanded', 'true', {
        timeout: 10_000,
      });
    });

    test('Edit Connection via context menu opens dialog', async ({ page, s, mongoInfo }) => {
      await page.goto('/');
      await createConnection(page, {
        name: 'CtxTest',
        host: mongoInfo.host,
        port: mongoInfo.port,
      });

      await s.sidebar.treeItem('CtxTest').click({ button: 'right' });
      await s.contextMenu.item('Edit Connection').click();

      await expect(s.connectionDialog.overlay()).toBeVisible();
      await expect(s.connectionDialog.heading()).toHaveText('Edit Connection');
    });

    test('Delete Connection via context menu removes it', async ({ page, s, mongoInfo }) => {
      await page.goto('/');
      await createConnection(page, {
        name: 'CtxTest',
        host: mongoInfo.host,
        port: mongoInfo.port,
      });

      await s.sidebar.treeItem('CtxTest').click({ button: 'right' });

      page.once('dialog', (dialog) => dialog.accept());
      await s.contextMenu.item('Delete Connection').click();

      await expect(s.sidebar.treeItem('CtxTest')).not.toBeVisible();
      await expect(s.sidebar.emptyState()).toBeVisible();
    });
  });

  test.describe('Connected Connection', () => {
    test('shows Refresh, Edit, Disconnect, Delete with separator', async ({
      page,
      s,
      mongoInfo,
    }) => {
      await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Alice' }]);
      await page.goto('/');
      await createConnection(page, {
        name: 'CtxTest',
        host: mongoInfo.host,
        port: mongoInfo.port,
      });
      await connectToServer(page, 'CtxTest');
      await expect(s.sidebar.treeItem(TEST_DB)).toBeVisible({ timeout: 10_000 });

      // Right-click the connected connection
      await s.sidebar.treeItem('CtxTest').click({ button: 'right' });

      await expect(s.contextMenu.menu()).toBeVisible();
      await expect(s.contextMenu.item('Refresh')).toBeVisible();
      await expect(s.contextMenu.item('Edit Connection')).toBeVisible();
      await expect(s.contextMenu.item('Disconnect')).toBeVisible();
      await expect(s.contextMenu.item('Delete Connection')).toBeVisible();
      // Separator should be present before Delete Connection
      await expect(s.contextMenu.separator()).toBeVisible();
    });

    test('Disconnect via context menu disconnects from server', async ({
      page,
      s,
      mongoInfo,
    }) => {
      await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Alice' }]);
      await page.goto('/');
      await createConnection(page, {
        name: 'CtxTest',
        host: mongoInfo.host,
        port: mongoInfo.port,
      });
      await connectToServer(page, 'CtxTest');
      await expect(s.sidebar.treeItem(TEST_DB)).toBeVisible({ timeout: 10_000 });

      await s.sidebar.treeItem('CtxTest').click({ button: 'right' });
      await s.contextMenu.item('Disconnect').click();

      await expect(s.sidebar.treeItem(TEST_DB)).not.toBeVisible({ timeout: 5_000 });
    });

    test('Delete Connection while connected shows combined confirmation', async ({
      page,
      s,
      mongoInfo,
    }) => {
      await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Alice' }]);
      await page.goto('/');
      await createConnection(page, {
        name: 'CtxTest',
        host: mongoInfo.host,
        port: mongoInfo.port,
      });
      await connectToServer(page, 'CtxTest');
      await expect(s.sidebar.treeItem(TEST_DB)).toBeVisible({ timeout: 10_000 });

      await s.sidebar.treeItem('CtxTest').click({ button: 'right' });

      // Capture the dialog message and accept
      let dialogMessage = '';
      page.once('dialog', (dialog) => {
        dialogMessage = dialog.message();
        dialog.accept();
      });
      await s.contextMenu.item('Delete Connection').click();

      await expect(s.sidebar.treeItem('CtxTest')).not.toBeVisible({ timeout: 10_000 });
      expect(dialogMessage).toContain('Disconnect and delete');
    });
  });

  test.describe('Database Node', () => {
    test('shows Refresh Collections', async ({ page, s, mongoInfo }) => {
      await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Alice' }]);
      await page.goto('/');
      await createConnection(page, {
        name: 'CtxTest',
        host: mongoInfo.host,
        port: mongoInfo.port,
      });
      await connectToServer(page, 'CtxTest');
      await expect(s.sidebar.treeItem(TEST_DB)).toBeVisible({ timeout: 10_000 });

      // Right-click the database node
      await s.sidebar.treeItem(TEST_DB).click({ button: 'right' });

      await expect(s.contextMenu.menu()).toBeVisible();
      await expect(s.contextMenu.item('Refresh Collections')).toBeVisible();
    });
  });

  test.describe('Collection Node', () => {
    test('shows Open in New Tab and Copy Collection Name', async ({ page, s, mongoInfo }) => {
      await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Alice' }]);
      await page.goto('/');
      await createConnection(page, {
        name: 'CtxTest',
        host: mongoInfo.host,
        port: mongoInfo.port,
      });
      await connectToServer(page, 'CtxTest');
      await expect(s.sidebar.treeItem(TEST_DB)).toBeVisible({ timeout: 10_000 });

      // Navigate to collection
      await expandTreeNode(page, TEST_DB);
      await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
      await expandTreeNode(page, 'Collections');
      await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeVisible({ timeout: 10_000 });

      // Right-click the collection
      await s.sidebar.treeItem(TEST_COLLECTION).click({ button: 'right' });

      await expect(s.contextMenu.menu()).toBeVisible();
      await expect(s.contextMenu.item('Open in New Tab')).toBeVisible();
      await expect(s.contextMenu.item('Copy Collection Name')).toBeVisible();
    });

    test('Open in New Tab via context menu opens a tab', async ({ page, s, mongoInfo }) => {
      await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Alice' }]);
      await page.goto('/');
      await createConnection(page, {
        name: 'CtxTest',
        host: mongoInfo.host,
        port: mongoInfo.port,
      });
      await connectToServer(page, 'CtxTest');
      await expect(s.sidebar.treeItem(TEST_DB)).toBeVisible({ timeout: 10_000 });

      await expandTreeNode(page, TEST_DB);
      await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
      await expandTreeNode(page, 'Collections');
      await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeVisible({ timeout: 10_000 });

      await s.sidebar.treeItem(TEST_COLLECTION).click({ button: 'right' });
      await s.contextMenu.item('Open in New Tab').click();

      await expect(s.tabs.bar()).toBeVisible();
      await expect(s.tabs.activeTab()).toBeVisible();
      await expect(s.query.editor()).toBeVisible();
    });
  });

  test.describe('Interaction', () => {
    test('clicking elsewhere closes the context menu', async ({ page, s, mongoInfo }) => {
      await page.goto('/');
      await createConnection(page, {
        name: 'CtxTest',
        host: mongoInfo.host,
        port: mongoInfo.port,
      });

      await s.sidebar.treeItem('CtxTest').click({ button: 'right' });
      await expect(s.contextMenu.menu()).toBeVisible();

      // Click elsewhere to close
      await page.locator('body').click({ position: { x: 0, y: 0 } });
      await expect(s.contextMenu.menu()).not.toBeVisible();
    });

    test('pressing Escape closes the context menu', async ({ page, s, mongoInfo }) => {
      await page.goto('/');
      await createConnection(page, {
        name: 'CtxTest',
        host: mongoInfo.host,
        port: mongoInfo.port,
      });

      await s.sidebar.treeItem('CtxTest').click({ button: 'right' });
      await expect(s.contextMenu.menu()).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(s.contextMenu.menu()).not.toBeVisible();
    });
  });
});
