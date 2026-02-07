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

const TEST_DB = 'e2e_export_test';
const TEST_COLLECTION = 'items';

/** Setup: seed data, navigate to collection, execute query. */
async function setupWithResults(
  page: import('@playwright/test').Page,
  s: ReturnType<typeof import('../helpers/selectors').selectors>,
  mongoInfo: { host: string; port: number }
) {
  await page.goto('/');
  await createConnection(page, {
    name: 'ExportTest',
    host: mongoInfo.host,
    port: mongoInfo.port,
  });
  await connectToServer(page, 'ExportTest');

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

test.describe('CSV Export', () => {
  test.beforeEach(async ({ request, mongoInfo }) => {
    await deleteAllConnections(request);
    await cleanupDatabase(mongoInfo, TEST_DB);
  });

  test.afterEach(async ({ request, mongoInfo }) => {
    await cleanupDatabase(mongoInfo, TEST_DB);
    await deleteAllConnections(request);
  });

  test('export buttons visible when results exist', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', value: 1 },
      { name: 'Bob', value: 2 },
    ]);

    await setupWithResults(page, s, mongoInfo);

    // Both export buttons should be visible
    await expect(s.results.exportPageButton()).toBeVisible();
    await expect(s.results.exportAllButton()).toBeVisible();
    // Export All should show the count
    await expect(s.results.exportAllButton()).toContainText('Export All (2)');
  });

  test('export all button shows total count', async ({ page, s, mongoInfo }) => {
    const docs = Array.from({ length: 75 }, (_, i) => ({
      name: `Item ${i}`,
      value: i,
    }));
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, docs);

    await setupWithResults(page, s, mongoInfo);

    // Export All should show total count (not just page count)
    await expect(s.results.exportAllButton()).toContainText('Export All (75)');
  });

  test('export buttons hidden when no results', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Alice' }]);

    await page.goto('/');
    await createConnection(page, {
      name: 'ExportTest',
      host: mongoInfo.host,
      port: mongoInfo.port,
    });
    await connectToServer(page, 'ExportTest');

    await expandTreeNode(page, TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
    await expandTreeNode(page, 'Collections');
    await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeVisible({ timeout: 10_000 });
    await s.sidebar.treeItem(TEST_COLLECTION).click();

    // Before executing a query, export buttons should not be visible
    await expect(s.results.exportPageButton()).not.toBeVisible();
    await expect(s.results.exportAllButton()).not.toBeVisible();
  });
});
