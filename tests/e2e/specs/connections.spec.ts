import {
  test,
  expect,
  createConnection,
  connectToServer,
  deleteAllConnections,
} from '../fixtures';

test.describe('Connection Management', () => {
  test.beforeEach(async ({ request }) => {
    await deleteAllConnections(request);
  });

  test('create a new connection', async ({ page, s, mongoInfo }) => {
    await page.goto('/');

    await createConnection(page, {
      name: 'Test Mongo',
      host: mongoInfo.host,
      port: mongoInfo.port,
    });

    // Connection should appear in sidebar
    await expect(s.sidebar.treeItem('Test Mongo')).toBeVisible();
    // Empty state should be gone
    await expect(s.sidebar.emptyState()).not.toBeVisible();
  });

  test('test connection shows success', async ({ page, s, mongoInfo }) => {
    await page.goto('/');

    await s.header.newConnectionButton().click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    await s.connectionDialog.nameInput().fill('Test Mongo');
    await s.connectionDialog.hostInput().clear();
    await s.connectionDialog.hostInput().fill(mongoInfo.host);
    await s.connectionDialog.portInput().clear();
    await s.connectionDialog.portInput().fill(String(mongoInfo.port));

    await s.connectionDialog.testButton().click();
    await expect(s.connectionDialog.testResultSuccess()).toBeVisible({ timeout: 10_000 });
  });

  test('connect to server and see databases', async ({ page, s, mongoInfo }) => {
    await page.goto('/');

    await createConnection(page, {
      name: 'Test Mongo',
      host: mongoInfo.host,
      port: mongoInfo.port,
    });

    // Connect
    await connectToServer(page, 'Test Mongo');

    // Should see at least the default admin/local databases
    await expect(s.sidebar.treeItem('admin')).toBeVisible({ timeout: 10_000 });
  });

  test('test connection with bad host shows failure', async ({ page, s }) => {
    await page.goto('/');

    await s.header.newConnectionButton().click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    await s.connectionDialog.nameInput().fill('Bad Connection');
    await s.connectionDialog.hostInput().clear();
    await s.connectionDialog.hostInput().fill('192.0.2.1');
    await s.connectionDialog.portInput().clear();
    await s.connectionDialog.portInput().fill('27017');

    await s.connectionDialog.testButton().click();
    await expect(s.connectionDialog.testResultFailure()).toBeVisible({ timeout: 15_000 });
  });
});
