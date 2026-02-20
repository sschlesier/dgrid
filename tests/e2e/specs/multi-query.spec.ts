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
import type { Page } from '@playwright/test';
import type { Selectors } from '../helpers/selectors';

interface MongoInfo {
  host: string;
  port: number;
  tempDir: string;
}

const TEST_DB = 'e2e_multi_query_test';
const COLLECTION_A = 'users';
const COLLECTION_B = 'orders';

test.describe('Multi-Query Execution', () => {
  test.beforeEach(async ({ request, mongoInfo }) => {
    await deleteAllConnections(request);
    await cleanupDatabase(mongoInfo, TEST_DB);
  });

  test.afterEach(async ({ request, mongoInfo }) => {
    await cleanupDatabase(mongoInfo, TEST_DB);
    await deleteAllConnections(request);
  });

  async function setupAndNavigate(page: Page, s: Selectors, mongoInfo: MongoInfo) {
    await seedDatabase(mongoInfo, TEST_DB, COLLECTION_A, [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
    await seedDatabase(mongoInfo, TEST_DB, COLLECTION_B, [
      { product: 'Widget', price: 10 },
      { product: 'Gadget', price: 20 },
    ]);

    await page.goto('/');
    await createConnection(page, { name: 'MultiTest', host: mongoInfo.host, port: mongoInfo.port });
    await connectToServer(page, 'MultiTest');

    await expandTreeNode(page, TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
    await expandTreeNode(page, 'Collections');
    await expect(s.sidebar.treeItem(COLLECTION_A)).toBeVisible({ timeout: 10_000 });
    await s.sidebar.treeItem(COLLECTION_A).click();
  }

  test('Run All with two queries shows sub-result tabs', async ({ page, s, mongoInfo }) => {
    await setupAndNavigate(page, s, mongoInfo);

    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(`db.${COLLECTION_A}.find({})\ndb.${COLLECTION_B}.find({})`);

    // Click the execute button (Run All)
    await s.query.executeButton().click();

    // Wait for sub-result tabs to appear
    await expect(s.query.subResultTabs()).toBeVisible({ timeout: 15_000 });

    // Should have 2 sub-result tabs
    await expect(s.query.subResultTab(0)).toBeVisible();
    await expect(s.query.subResultTab(1)).toBeVisible();

    // First tab should be active and show results
    await expect(s.query.subResultTab(0)).toHaveClass(/active/);
    await expect(s.results.gridViewport()).toBeVisible();
    await expect(s.results.gridViewport()).toContainText('Alice');
  });

  test('sub-tab switching shows different results', async ({ page, s, mongoInfo }) => {
    await setupAndNavigate(page, s, mongoInfo);

    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(`db.${COLLECTION_A}.find({})\ndb.${COLLECTION_B}.find({})`);
    await s.query.executeButton().click();

    await expect(s.query.subResultTabs()).toBeVisible({ timeout: 15_000 });

    // First tab shows users
    await expect(s.results.gridViewport()).toContainText('Alice');

    // Switch to second tab
    await s.query.subResultTab(1).click();
    await expect(s.query.subResultTab(1)).toHaveClass(/active/);
    await expect(s.results.gridViewport()).toContainText('Widget');
  });

  test('single query shows no sub-tabs (backward compat)', async ({ page, s, mongoInfo }) => {
    await setupAndNavigate(page, s, mongoInfo);

    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(`db.${COLLECTION_A}.find({})`);
    await s.query.executeButton().click();

    await expect(s.results.gridViewport()).toBeVisible({ timeout: 10_000 });
    await expect(s.results.gridViewport()).toContainText('Alice');

    // Sub-result tabs should NOT be visible for single query
    await expect(s.query.subResultTabs()).not.toBeVisible();
  });

  test('error in one query shows error tab while other shows results', async ({
    page,
    s,
    mongoInfo,
  }) => {
    await setupAndNavigate(page, s, mongoInfo);

    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    // First query is valid, second has syntax error
    await page.keyboard.type(
      `db.${COLLECTION_A}.find({})\ndb.${COLLECTION_A}.find({invalid syntax!!!`
    );
    await s.query.executeButton().click();

    await expect(s.query.subResultTabs()).toBeVisible({ timeout: 15_000 });

    // First tab should have results
    await expect(s.query.subResultTab(0)).toBeVisible();
    await expect(s.results.gridViewport()).toBeVisible();
    await expect(s.results.gridViewport()).toContainText('Alice');

    // Second tab should show error indicator
    await expect(s.query.subResultTabWithError()).toBeVisible();

    // Switch to error tab
    await s.query.subResultTab(1).click();
    await expect(s.query.errorDisplay()).toBeVisible();
  });

  test('execute dropdown shows mode options', async ({ page, s, mongoInfo }) => {
    await setupAndNavigate(page, s, mongoInfo);

    // Click dropdown toggle
    await s.query.executeDropdownToggle().click();
    await expect(s.query.executeDropdown()).toBeVisible();

    // Should show all three modes
    await expect(s.query.executeDropdownItem('Run All')).toBeVisible();
    await expect(s.query.executeDropdownItem('Run Current')).toBeVisible();
    await expect(s.query.executeDropdownItem('Run Selected')).toBeVisible();
  });

  test('Run Current executes only the query at cursor', async ({ page, s, mongoInfo }) => {
    await setupAndNavigate(page, s, mongoInfo);

    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(`db.${COLLECTION_A}.find({})\ndb.${COLLECTION_B}.find({})`);

    // Move cursor to the first line
    await page.keyboard.press('Home');
    await page.keyboard.press('Meta+Home');

    // Use Cmd+Shift+Enter for Run Current
    await page.keyboard.press('Meta+Shift+Enter');

    // Should show single result (no sub-tabs) for the first query
    await expect(s.results.gridViewport()).toBeVisible({ timeout: 10_000 });
    await expect(s.results.gridViewport()).toContainText('Alice');
    await expect(s.query.subResultTabs()).not.toBeVisible();
  });

  test('status bar shows sub-result info for multi-query', async ({ page, s, mongoInfo }) => {
    await setupAndNavigate(page, s, mongoInfo);

    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(`db.${COLLECTION_A}.find({})\ndb.${COLLECTION_B}.find({})`);
    await s.query.executeButton().click();

    await expect(s.query.subResultTabs()).toBeVisible({ timeout: 15_000 });

    // Status bar should show [1/2] prefix
    await expect(s.statusBar.center()).toContainText('[1/2]');
    await expect(s.statusBar.center()).toContainText('2 documents');
  });

  test('multi-line chained query is treated as single query', async ({ page, s, mongoInfo }) => {
    await setupAndNavigate(page, s, mongoInfo);

    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    // Multi-line query with chain — should be treated as one query
    await page.keyboard.type(`db.${COLLECTION_A}.find({})\n  .limit(1)`);
    await s.query.executeButton().click();

    await expect(s.results.gridViewport()).toBeVisible({ timeout: 10_000 });
    // No sub-tabs for single (chained) query — the continuation line stays grouped
    await expect(s.query.subResultTabs()).not.toBeVisible();
    // Should show results in status bar (query was treated as one unit)
    await expect(s.statusBar.center()).toContainText('documents');
  });
});
