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

const TEST_DB = 'e2e_views_test';
const TEST_COLLECTION = 'items';

/** Setup: seed data, navigate to collection, execute query. */
async function setupWithResults(
  page: import('@playwright/test').Page,
  s: ReturnType<typeof import('../helpers/selectors').selectors>,
  mongoInfo: { host: string; port: number }
) {
  await page.goto('/');
  await createConnection(page, { name: 'ViewsTest', host: mongoInfo.host, port: mongoInfo.port });
  await connectToServer(page, 'ViewsTest');

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

test.describe('Results View Modes', () => {
  test.beforeEach(async ({ request, mongoInfo }) => {
    await deleteAllConnections(request);
    await cleanupDatabase(mongoInfo, TEST_DB);
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
  });

  test.afterEach(async ({ request, mongoInfo }) => {
    await cleanupDatabase(mongoInfo, TEST_DB);
    await deleteAllConnections(request);
  });

  test('view switching cycles through Table, JSON, Tree and back', async ({
    page,
    s,
    mongoInfo,
  }) => {
    await setupWithResults(page, s, mongoInfo);

    // Default: Table view active, export button visible
    await expect(s.results.gridViewport()).toBeVisible();
    await expect(s.results.viewButton('Table')).toHaveClass(/active/);
    await expect(s.results.exportButton()).toBeVisible();
    await expect(s.results.exportButton()).toHaveText('Export CSV');

    // Switch to JSON view
    await s.results.viewButton('JSON').click();
    await expect(s.results.jsonView()).toBeVisible();
    await expect(s.results.gridViewport()).not.toBeVisible();
    await expect(s.results.viewButton('JSON')).toHaveClass(/active/);

    // Switch to Tree view
    await s.results.viewButton('Tree').click();
    await expect(s.results.treeView()).toBeVisible();
    await expect(s.results.gridViewport()).not.toBeVisible();
    await expect(s.results.viewButton('Tree')).toHaveClass(/active/);

    // Switch back to Table
    await s.results.viewButton('Table').click();
    await expect(s.results.gridViewport()).toBeVisible();
    await expect(s.results.treeView()).not.toBeVisible();
    await expect(s.results.viewButton('Table')).toHaveClass(/active/);
  });

  test('export CSV button hidden when no results', async ({ page, s, mongoInfo }) => {
    await page.goto('/');
    await createConnection(page, { name: 'ViewsTest', host: mongoInfo.host, port: mongoInfo.port });
    await connectToServer(page, 'ViewsTest');

    await expandTreeNode(page, TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
    await expandTreeNode(page, 'Collections');
    await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeVisible({ timeout: 10_000 });
    await s.sidebar.treeItem(TEST_COLLECTION).click();

    // Before executing a query, export button should not be visible
    await expect(s.results.exportButton()).not.toBeVisible();
  });
});
