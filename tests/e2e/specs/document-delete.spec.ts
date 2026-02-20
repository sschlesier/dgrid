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

const TEST_DB = 'e2e_delete_test';
const TEST_COLLECTION = 'items';

/** Navigate to collection and execute a find query. */
async function setupQueryTab(
  page: import('@playwright/test').Page,
  s: ReturnType<typeof import('../helpers/selectors').selectors>,
  mongoInfo: { host: string; port: number }
) {
  await page.goto('/');
  await createConnection(page, { name: 'DeleteTest', host: mongoInfo.host, port: mongoInfo.port });
  await connectToServer(page, 'DeleteTest');

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

test.describe('Document Delete', () => {
  test.beforeEach(async ({ request, mongoInfo }) => {
    await deleteAllConnections(request);
    await cleanupDatabase(mongoInfo, TEST_DB);
  });

  test.afterEach(async ({ request, mongoInfo }) => {
    await cleanupDatabase(mongoInfo, TEST_DB);
    await deleteAllConnections(request);
  });

  test('right-click shows context menu with Delete Document option', async ({
    page,
    s,
    mongoInfo,
  }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', value: 1 },
      { name: 'Bob', value: 2 },
    ]);

    await setupQueryTab(page, s, mongoInfo);

    // Right-click on a row
    const row = s.results.gridRow(0);
    await row.click({ button: 'right' });

    // Context menu should appear
    await expect(s.contextMenu.menu()).toBeVisible();
    await expect(s.contextMenu.item('Delete Document')).toBeVisible();
  });

  test('delete document removes it from results', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'ToDelete', value: 1 },
      { name: 'ToKeep', value: 2 },
    ]);

    await setupQueryTab(page, s, mongoInfo);

    // Verify both documents are visible
    await expect(s.results.gridViewport()).toContainText('ToDelete');
    await expect(s.results.gridViewport()).toContainText('ToKeep');

    // Right-click on the row containing "ToDelete"
    const cell = s.results.gridCell().filter({ hasText: 'ToDelete' }).first();
    const row = page.locator('.grid-row').filter({ has: cell });

    // Accept the confirm dialog before clicking delete
    page.on('dialog', (dialog) => dialog.accept());

    await row.click({ button: 'right' });
    await expect(s.contextMenu.menu()).toBeVisible();
    await s.contextMenu.item('Delete Document').click();

    // Document should be removed after re-query
    await expect(s.results.gridViewport()).not.toContainText('ToDelete');
    await expect(s.results.gridViewport()).toContainText('ToKeep');
  });

  test('cancel delete keeps document in results', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'StayHere', value: 1 }]);

    await setupQueryTab(page, s, mongoInfo);

    await expect(s.results.gridViewport()).toContainText('StayHere');

    // Dismiss the confirm dialog
    page.on('dialog', (dialog) => dialog.dismiss());

    const row = s.results.gridRow(0);
    await row.click({ button: 'right' });
    await expect(s.contextMenu.menu()).toBeVisible();
    await s.contextMenu.item('Delete Document').click();

    // Context menu should close but document should remain
    await expect(s.contextMenu.menu()).not.toBeVisible();
    await expect(s.results.gridViewport()).toContainText('StayHere');
  });
});
