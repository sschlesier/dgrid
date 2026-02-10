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

  test('save password checkbox is visible and unchecked by default', async ({ page, s }) => {
    await page.goto('/');

    await s.header.newConnectionButton().click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    // Should be unchecked by default on Form tab
    await expect(s.connectionDialog.savePasswordCheckbox()).not.toBeChecked();

    // Switch to URI tab — should also be unchecked
    await s.connectionDialog.uriTab().click();
    await expect(s.connectionDialog.savePasswordCheckbox()).not.toBeChecked();
  });

  test('save password checkbox state persists when switching tabs', async ({ page, s }) => {
    await page.goto('/');

    await s.header.newConnectionButton().click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    // Check on Form tab
    await s.connectionDialog.savePasswordCheckbox().check();
    await expect(s.connectionDialog.savePasswordCheckbox()).toBeChecked();

    // Switch to URI → should still be checked
    await s.connectionDialog.uriTab().click();
    await expect(s.connectionDialog.savePasswordCheckbox()).toBeChecked();

    // Switch back to Form → still checked
    await s.connectionDialog.formTab().click();
    await expect(s.connectionDialog.savePasswordCheckbox()).toBeChecked();
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
