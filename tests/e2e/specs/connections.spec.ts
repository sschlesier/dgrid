import {
  test,
  expect,
  createConnection,
  createConnectionViaUri,
  connectToServer,
  deleteAllConnections,
} from '../fixtures';

test.describe('Connection Management', () => {
  test.beforeEach(async ({ request }) => {
    await deleteAllConnections(request);
  });

  test('create a new connection via form tab', async ({ page, s, mongoInfo }) => {
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

  test('create a new connection via URI tab', async ({ page, s, mongoInfo }) => {
    await page.goto('/');

    await createConnectionViaUri(page, {
      name: 'URI Connection',
      uri: `mongodb://${mongoInfo.host}:${mongoInfo.port}`,
    });

    // Connection should appear in sidebar
    await expect(s.sidebar.treeItem('URI Connection')).toBeVisible();
  });

  test('connect and query via URI-tab connection', async ({ page, s, mongoInfo }) => {
    await page.goto('/');

    await createConnectionViaUri(page, {
      name: 'URI Query Test',
      uri: `mongodb://${mongoInfo.host}:${mongoInfo.port}`,
    });

    await connectToServer(page, 'URI Query Test');
    await expect(s.sidebar.treeItem('admin')).toBeVisible({ timeout: 10_000 });
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

  test('save password unchecked → connect → password prompt appears', async ({
    page,
    s,
    mongoInfo,
  }) => {
    await page.goto('/');

    // Create connection with credentials and savePassword=false (default) via URI tab
    await s.header.newConnectionButton().click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    await s.connectionDialog.nameInput().clear();
    await s.connectionDialog.nameInput().fill('Auth Test');

    // Switch to URI tab to enter credentials
    await s.connectionDialog.uriTab().click();
    await s.connectionDialog
      .uriInput()
      .fill(`mongodb://testuser:testpass@${mongoInfo.host}:${mongoInfo.port}`);

    // savePassword is unchecked by default — handle confirmation dialog
    page.on('dialog', (dialog) => dialog.accept());

    await s.connectionDialog.saveButton().click();
    await expect(s.connectionDialog.overlay()).not.toBeVisible();

    // Click the connection in sidebar — should show password prompt
    await s.sidebar.treeItem('Auth Test').click();
    await expect(s.passwordPrompt.overlay()).toBeVisible({ timeout: 5000 });

    // Enter password and connect
    await s.passwordPrompt.input().fill('testpass');
    await s.passwordPrompt.connectButton().click();

    // Password prompt should close
    await expect(s.passwordPrompt.overlay()).not.toBeVisible();
  });
});
