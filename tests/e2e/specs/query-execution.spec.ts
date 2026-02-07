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

const TEST_DB = 'e2e_query_test';
const TEST_COLLECTION = 'users';

test.describe('Query Execution', () => {
  test.beforeEach(async ({ request, mongoInfo }) => {
    await deleteAllConnections(request);
    await cleanupDatabase(mongoInfo, TEST_DB);
  });

  test.afterEach(async ({ request, mongoInfo }) => {
    await cleanupDatabase(mongoInfo, TEST_DB);
    await deleteAllConnections(request);
  });

  test('execute a find query and see results in grid', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
      { name: 'Charlie', age: 35 },
    ]);

    await page.goto('/');
    await createConnection(page, { name: 'QueryTest', host: mongoInfo.host, port: mongoInfo.port });
    await connectToServer(page, 'QueryTest');

    // Expand database > Collections > click collection
    await expandTreeNode(page, TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
    await expandTreeNode(page, 'Collections');
    await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeVisible({ timeout: 10_000 });
    await s.sidebar.treeItem(TEST_COLLECTION).click();

    // Type and execute query
    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(`db.${TEST_COLLECTION}.find({})`);
    await s.query.executeButton().click();

    // Verify grid is visible with data
    await expect(s.results.gridViewport()).toBeVisible({ timeout: 10_000 });
    await expect(s.results.gridCell().first()).toBeVisible();
    // Verify we see our seeded data
    await expect(s.results.gridViewport()).toContainText('Alice');
    await expect(s.results.gridViewport()).toContainText('Bob');
    await expect(s.results.gridViewport()).toContainText('Charlie');
  });

  test('execute query with Cmd+Enter shortcut', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Alice', age: 30 }]);

    await page.goto('/');
    await createConnection(page, { name: 'QueryTest', host: mongoInfo.host, port: mongoInfo.port });
    await connectToServer(page, 'QueryTest');

    await expandTreeNode(page, TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
    await expandTreeNode(page, 'Collections');
    await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeVisible({ timeout: 10_000 });
    await s.sidebar.treeItem(TEST_COLLECTION).click();

    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(`db.${TEST_COLLECTION}.find({})`);
    await page.keyboard.press('Meta+Enter');

    await expect(s.results.gridViewport()).toBeVisible({ timeout: 10_000 });
    await expect(s.results.gridViewport()).toContainText('Alice');
  });

  test('invalid query shows error display', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Alice' }]);

    await page.goto('/');
    await createConnection(page, { name: 'QueryTest', host: mongoInfo.host, port: mongoInfo.port });
    await connectToServer(page, 'QueryTest');

    await expandTreeNode(page, TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
    await expandTreeNode(page, 'Collections');
    await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeVisible({ timeout: 10_000 });
    await s.sidebar.treeItem(TEST_COLLECTION).click();

    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type('db.users.find({invalid syntax!!!');
    await s.query.executeButton().click();

    await expect(s.query.errorDisplay()).toBeVisible({ timeout: 10_000 });
  });

  test('pagination with more than 50 documents', async ({ page, s, mongoInfo }) => {
    // Seed 60 documents
    const docs = Array.from({ length: 60 }, (_, i) => ({
      name: `User ${String(i + 1).padStart(3, '0')}`,
      index: i + 1,
    }));
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, docs);

    await page.goto('/');
    await createConnection(page, { name: 'QueryTest', host: mongoInfo.host, port: mongoInfo.port });
    await connectToServer(page, 'QueryTest');

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

    // Verify pagination is visible
    await expect(s.results.pagination()).toBeVisible();
    await expect(s.results.paginationCount()).toContainText('60 documents');
    await expect(s.results.pageInfo()).toContainText('Page 1 of 2');

    // Navigate to page 2
    await s.results.nextPageButton().click();
    await expect(s.results.pageInfo()).toContainText('Page 2 of 2');
  });

  test('results show execution time and doc count in status bar', async ({
    page,
    s,
    mongoInfo,
  }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);

    await page.goto('/');
    await createConnection(page, { name: 'QueryTest', host: mongoInfo.host, port: mongoInfo.port });
    await connectToServer(page, 'QueryTest');

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

    // Status bar should show document count and execution time
    await expect(s.statusBar.center()).toContainText('2 documents');
    await expect(s.statusBar.center()).toContainText('ms');
  });
});
