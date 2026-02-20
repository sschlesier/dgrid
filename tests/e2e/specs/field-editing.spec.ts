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

const TEST_DB = 'e2e_edit_test';
const TEST_COLLECTION = 'items';

/** Navigate to collection and execute a find query. */
async function setupQueryTab(
  page: import('@playwright/test').Page,
  s: ReturnType<typeof import('../helpers/selectors').selectors>,
  mongoInfo: { host: string; port: number }
) {
  await page.goto('/');
  await createConnection(page, { name: 'EditTest', host: mongoInfo.host, port: mongoInfo.port });
  await connectToServer(page, 'EditTest');

  await expandTreeNode(page, TEST_DB);
  await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
  await expandTreeNode(page, 'Collections');
  await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeVisible({ timeout: 10_000 });
  await s.sidebar.treeItem(TEST_COLLECTION).click();

  const editor = s.query.editorContent();
  await editor.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.type(`db.${TEST_COLLECTION}.find({})`);
  await s.query.executeButton().click();
  await expect(s.results.gridViewport()).toBeVisible({ timeout: 10_000 });
}

test.describe('Field Editing', () => {
  test.beforeEach(async ({ request, mongoInfo }) => {
    await deleteAllConnections(request);
    await cleanupDatabase(mongoInfo, TEST_DB);
  });

  test.afterEach(async ({ request, mongoInfo }) => {
    await cleanupDatabase(mongoInfo, TEST_DB);
    await deleteAllConnections(request);
  });

  test('edit a string field value', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Original', value: 42 }]);

    await setupQueryTab(page, s, mongoInfo);

    // Find the cell with "Original" text and focus it
    const cell = s.results.gridCell().filter({ hasText: 'Original' }).first();
    await cell.click();
    await page.keyboard.press('Meta+E');

    // Edit dialog should appear
    await expect(s.editDialog.overlay()).toBeVisible();
    await expect(s.editDialog.fieldPath()).toContainText('name');

    // Change value
    const valueInput = s.editDialog.valueInput();
    await valueInput.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type('Updated');
    await s.editDialog.saveButton().click();

    // Dialog should close
    await expect(s.editDialog.overlay()).not.toBeVisible();

    // Re-query to verify the change persisted
    await expect(s.results.gridViewport()).toContainText('Updated');
  });

  test('change field type from string to number', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'TestItem', score: 'not-a-number' },
    ]);

    await setupQueryTab(page, s, mongoInfo);

    // Focus the cell with "not-a-number" and edit
    const cell = s.results.gridCell().filter({ hasText: 'not-a-number' }).first();
    await cell.click();
    await page.keyboard.press('Meta+E');

    await expect(s.editDialog.overlay()).toBeVisible();

    // Change type to Number
    await s.editDialog.typeSelect().selectOption('number');

    // Enter a numeric value
    const valueInput = s.editDialog.valueInput();
    await valueInput.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type('99');
    await s.editDialog.saveButton().click();

    await expect(s.editDialog.overlay()).not.toBeVisible();
    await expect(s.results.gridViewport()).toContainText('99');
  });

  test('cancel edit dialog preserves original value', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'KeepMe' }]);

    await setupQueryTab(page, s, mongoInfo);

    const cell = s.results.gridCell().filter({ hasText: 'KeepMe' }).first();
    await cell.click();
    await page.keyboard.press('Meta+E');

    await expect(s.editDialog.overlay()).toBeVisible();

    // Modify the value but cancel
    const valueInput = s.editDialog.valueInput();
    await valueInput.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type('Changed');
    await s.editDialog.cancelButton().click();

    // Dialog should close and original value should remain
    await expect(s.editDialog.overlay()).not.toBeVisible();
    await expect(s.results.gridViewport()).toContainText('KeepMe');
  });
});
