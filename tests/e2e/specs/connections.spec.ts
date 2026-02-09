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

  test('URI preview updates live when form fields change', async ({ page, s }) => {
    await page.goto('/');

    await s.header.newConnectionButton().click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    // URI preview should be visible on form tab
    await expect(s.connectionDialog.uriPreview()).toBeVisible();

    // Change host
    await s.connectionDialog.hostInput().clear();
    await s.connectionDialog.hostInput().fill('myhost.example.com');

    // Check URI preview contains the new host
    await expect(s.connectionDialog.uriPreview()).toContainText('myhost.example.com');
  });

  test('switching tabs syncs URI and form fields', async ({ page, s, mongoInfo }) => {
    await page.goto('/');

    await s.header.newConnectionButton().click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    // Fill form fields
    await s.connectionDialog.hostInput().clear();
    await s.connectionDialog.hostInput().fill(mongoInfo.host);
    await s.connectionDialog.portInput().clear();
    await s.connectionDialog.portInput().fill(String(mongoInfo.port));

    // Switch to URI tab — should sync form → URI
    await s.connectionDialog.uriTab().click();
    await expect(s.connectionDialog.uriInput()).toHaveValue(
      new RegExp(`mongodb://${mongoInfo.host}:${mongoInfo.port}`)
    );

    // Switch back to form — URI input should parse back
    await s.connectionDialog.formTab().click();
    await expect(s.connectionDialog.hostInput()).toHaveValue(mongoInfo.host);
  });

  test('SRV toggle hides port field and auto-checks TLS', async ({ page, s }) => {
    await page.goto('/');

    await s.header.newConnectionButton().click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    // Port should be visible initially
    await expect(s.connectionDialog.portInput()).toBeVisible();
    // TLS should not be checked
    await expect(s.connectionDialog.tlsCheckbox()).not.toBeChecked();

    // Click SRV button
    const srvToggle = s.connectionDialog.srvToggle();
    await srvToggle.locator('button', { hasText: 'SRV' }).click();

    // Port should be hidden
    await expect(s.connectionDialog.portInput()).not.toBeVisible();
    // TLS should be auto-checked
    await expect(s.connectionDialog.tlsCheckbox()).toBeChecked();
    // TLS should be disabled
    await expect(s.connectionDialog.tlsCheckbox()).toBeDisabled();
  });
});
