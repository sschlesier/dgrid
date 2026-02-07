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

const TEST_DB = 'e2e_history_test';
const TEST_COLLECTION = 'items';

/** Setup: seed data, navigate to collection, open query tab. */
async function setupQueryTab(
  page: import('@playwright/test').Page,
  s: ReturnType<typeof import('../helpers/selectors').selectors>,
  mongoInfo: { host: string; port: number }
) {
  await page.goto('/');
  await createConnection(page, {
    name: 'HistoryTest',
    host: mongoInfo.host,
    port: mongoInfo.port,
  });
  await connectToServer(page, 'HistoryTest');

  await expandTreeNode(page, TEST_DB);
  await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
  await expandTreeNode(page, 'Collections');
  await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeVisible({ timeout: 10_000 });
  await s.sidebar.treeItem(TEST_COLLECTION).click();
}

test.describe('Query History', () => {
  test.beforeEach(async ({ request, mongoInfo }) => {
    await deleteAllConnections(request);
    await cleanupDatabase(mongoInfo, TEST_DB);
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Alice', age: 30 }]);
  });

  test.afterEach(async ({ request, mongoInfo }) => {
    await cleanupDatabase(mongoInfo, TEST_DB);
    await deleteAllConnections(request);
  });

  test('executed query appears in history', async ({ page, s, mongoInfo }) => {
    await setupQueryTab(page, s, mongoInfo);

    // Execute a query
    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(`db.${TEST_COLLECTION}.find({})`);
    await s.query.executeButton().click();
    await expect(s.results.gridViewport()).toBeVisible({ timeout: 10_000 });

    // Open history
    await s.history.toolbarButton().click();
    await expect(s.history.dropdown()).toBeVisible();

    // The query should appear in history
    await expect(s.history.item().first()).toBeVisible();
    await expect(s.history.itemQuery().first()).toContainText('db.items.find');
  });

  test('click history entry reloads query into editor', async ({ page, s, mongoInfo }) => {
    await setupQueryTab(page, s, mongoInfo);

    // Execute first query
    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(`db.${TEST_COLLECTION}.find({})`);
    await s.query.executeButton().click();
    await expect(s.results.gridViewport()).toBeVisible({ timeout: 10_000 });

    // Type a different query (don't execute)
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type('db.items.find({name: "Bob"})');

    // Open history and click the previous query
    await s.history.toolbarButton().click();
    await expect(s.history.dropdown()).toBeVisible();
    await s.history.item().first().click();

    // History dropdown should close
    await expect(s.history.dropdown()).not.toBeVisible();

    // Editor should contain the previous query
    await expect(s.query.editorContent()).toContainText('db.items.find({})');
  });

  test('clear history removes all entries', async ({ page, s, mongoInfo }) => {
    await setupQueryTab(page, s, mongoInfo);

    // Execute a query to create history
    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(`db.${TEST_COLLECTION}.find({})`);
    await s.query.executeButton().click();
    await expect(s.results.gridViewport()).toBeVisible({ timeout: 10_000 });

    // Open history and verify entry exists
    await s.history.toolbarButton().click();
    await expect(s.history.dropdown()).toBeVisible();
    await expect(s.history.item().first()).toBeVisible();

    // Clear history
    await s.history.clearButton().click();

    // History should be empty
    await expect(s.history.emptyState()).toBeVisible();
    await expect(s.history.item()).not.toBeVisible();
  });
});
