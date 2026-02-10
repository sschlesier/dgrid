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

  test('password field is disabled by default for new connections', async ({ page, s }) => {
    await page.goto('/');

    await s.header.newConnectionButton().click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    // Save password is unchecked by default → password field should be disabled
    await expect(s.connectionDialog.savePasswordCheckbox()).not.toBeChecked();
    await expect(s.connectionDialog.passwordInput()).toBeDisabled();
  });

  test('password field enables when save password is checked', async ({ page, s }) => {
    await page.goto('/');

    await s.header.newConnectionButton().click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    // Check save password
    await s.connectionDialog.savePasswordCheckbox().check();
    await expect(s.connectionDialog.passwordInput()).not.toBeDisabled();
  });

  test('password field clears and disables when save password is unchecked', async ({
    page,
    s,
  }) => {
    await page.goto('/');

    await s.header.newConnectionButton().click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    // Enable save password and type a password
    await s.connectionDialog.savePasswordCheckbox().check();
    await s.connectionDialog.passwordInput().fill('secret123');
    await expect(s.connectionDialog.passwordInput()).toHaveValue('secret123');

    // Uncheck save password
    await s.connectionDialog.savePasswordCheckbox().uncheck();

    // Password should be cleared and field disabled
    await expect(s.connectionDialog.passwordInput()).toHaveValue('');
    await expect(s.connectionDialog.passwordInput()).toBeDisabled();
  });

  test('test connection prompts for password when username set and save password off (form)', async ({
    page,
    s,
    mongoInfo,
  }) => {
    await page.goto('/');

    await s.header.newConnectionButton().click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    await s.connectionDialog.nameInput().fill('Prompt Test');
    await s.connectionDialog.hostInput().clear();
    await s.connectionDialog.hostInput().fill(mongoInfo.host);
    await s.connectionDialog.portInput().clear();
    await s.connectionDialog.portInput().fill(String(mongoInfo.port));

    // Enter a username (save password is off by default)
    await s.connectionDialog.usernameInput().fill('testuser');

    // Click test connection → should show password prompt
    await s.connectionDialog.testButton().click();
    await expect(s.passwordPrompt.overlay()).toBeVisible();

    // Enter password and submit
    await s.passwordPrompt.input().fill('testpass');
    await s.passwordPrompt.connectButton().click();

    // Password prompt should close and test result should appear
    await expect(s.passwordPrompt.overlay()).not.toBeVisible();
    // Test result should eventually appear (success or failure depending on auth)
    await expect(
      s.connectionDialog.testResultSuccess().or(s.connectionDialog.testResultFailure())
    ).toBeVisible({ timeout: 15_000 });
  });

  test('test connection prompts for password in URI mode when username but no password', async ({
    page,
    s,
    mongoInfo,
  }) => {
    await page.goto('/');

    await s.header.newConnectionButton().click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    await s.connectionDialog.nameInput().fill('URI Prompt Test');

    // Switch to URI tab
    await s.connectionDialog.uriTab().click();
    // URI with username but no password
    await s.connectionDialog
      .uriInput()
      .fill(`mongodb://testuser@${mongoInfo.host}:${mongoInfo.port}`);

    // Click test connection → should show password prompt
    await s.connectionDialog.testButton().click();
    await expect(s.passwordPrompt.overlay()).toBeVisible();

    // Cancel the prompt
    await s.passwordPrompt.cancelButton().click();
    await expect(s.passwordPrompt.overlay()).not.toBeVisible();
  });

  test('test connection does NOT prompt when no username', async ({ page, s, mongoInfo }) => {
    await page.goto('/');

    await s.header.newConnectionButton().click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    await s.connectionDialog.nameInput().fill('No User Test');
    await s.connectionDialog.hostInput().clear();
    await s.connectionDialog.hostInput().fill(mongoInfo.host);
    await s.connectionDialog.portInput().clear();
    await s.connectionDialog.portInput().fill(String(mongoInfo.port));

    // No username, save password off → should test directly without prompting
    await s.connectionDialog.testButton().click();

    // Should NOT show password prompt
    await expect(s.passwordPrompt.overlay()).not.toBeVisible();
    // Should show test result directly
    await expect(s.connectionDialog.testResultSuccess()).toBeVisible({ timeout: 10_000 });
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
