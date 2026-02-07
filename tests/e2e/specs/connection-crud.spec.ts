import { test, expect, createConnection, deleteAllConnections } from '../fixtures';

test.describe('Connection Edit and Delete', () => {
  test.beforeEach(async ({ request }) => {
    await deleteAllConnections(request);
  });

  test.afterEach(async ({ request }) => {
    await deleteAllConnections(request);
  });

  test('edit connection name', async ({ page, s, mongoInfo }) => {
    await page.goto('/');
    await createConnection(page, { name: 'OldName', host: mongoInfo.host, port: mongoInfo.port });
    await expect(s.sidebar.treeItem('OldName')).toBeVisible();

    // Click edit button on the connection
    await s.sidebar.actionButton('Edit connection').click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    // Change the name
    await s.connectionDialog.nameInput().clear();
    await s.connectionDialog.nameInput().fill('NewName');
    await s.connectionDialog.saveButton().click();

    await expect(s.connectionDialog.overlay()).not.toBeVisible();
    // Verify name updated in sidebar
    await expect(s.sidebar.treeItem('NewName')).toBeVisible();
    await expect(s.sidebar.treeItem('OldName')).not.toBeVisible();
  });

  test('delete a connection', async ({ page, s, mongoInfo }) => {
    await page.goto('/');
    await createConnection(page, { name: 'ToDelete', host: mongoInfo.host, port: mongoInfo.port });
    await expect(s.sidebar.treeItem('ToDelete')).toBeVisible();

    // Click edit button
    await s.sidebar.actionButton('Edit connection').click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    // Accept the confirmation dialog, then click delete
    page.once('dialog', (dialog) => dialog.accept());
    await s.connectionDialog.deleteButton().click();

    await expect(s.connectionDialog.overlay()).not.toBeVisible({ timeout: 10_000 });
    // Connection should be gone from sidebar
    await expect(s.sidebar.treeItem('ToDelete')).not.toBeVisible();
    await expect(s.sidebar.emptyState()).toBeVisible();
  });

  test('edit dialog shows "Edit Connection" heading', async ({ page, s, mongoInfo }) => {
    await page.goto('/');
    await createConnection(page, { name: 'TestConn', host: mongoInfo.host, port: mongoInfo.port });

    // Click edit button
    await s.sidebar.actionButton('Edit connection').click();
    await expect(s.connectionDialog.overlay()).toBeVisible();
    await expect(s.connectionDialog.heading()).toHaveText('Edit Connection');
  });
});
