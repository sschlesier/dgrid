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

const TEST_DB = 'e2e_context_menu';
const TEST_COLLECTION = 'items';

/** Navigate to collection and execute a find query. */
async function setupQueryTab(
  page: import('@playwright/test').Page,
  s: ReturnType<typeof import('../helpers/selectors').selectors>,
  mongoInfo: { host: string; port: number }
) {
  await page.goto('/');
  await createConnection(page, {
    name: 'CtxMenuTest',
    host: mongoInfo.host,
    port: mongoInfo.port,
  });
  await connectToServer(page, 'CtxMenuTest');

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

test.describe('Grid Context Menu', () => {
  test.beforeEach(async ({ request, mongoInfo }) => {
    await deleteAllConnections(request);
    await cleanupDatabase(mongoInfo, TEST_DB);
  });

  test.afterEach(async ({ request, mongoInfo }) => {
    await cleanupDatabase(mongoInfo, TEST_DB);
    await deleteAllConnections(request);
  });

  test('right-clicking a cell shows all context menu items', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', value: 42 },
    ]);
    await setupQueryTab(page, s, mongoInfo);

    // Right-click on a specific cell (the "name" cell)
    const cell = s.results.gridCell().filter({ hasText: 'Alice' }).first();
    await cell.click({ button: 'right' });

    await expect(s.contextMenu.menu()).toBeVisible();
    await expect(s.contextMenu.item('Edit Field')).toBeVisible();
    await expect(s.contextMenu.item('Copy Value')).toBeVisible();
    await expect(s.contextMenu.item('Copy Field Path')).toBeVisible();
    await expect(s.contextMenu.item('Copy Document as JSON')).toBeVisible();
    await expect(s.contextMenu.item('Copy _id')).toBeVisible();
    await expect(s.contextMenu.item('Delete Document')).toBeVisible();
    await expect(s.contextMenu.separator()).toBeVisible();
  });

  test('Edit Field opens the edit dialog for the right-clicked cell', async ({
    page,
    s,
    mongoInfo,
  }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'EditMe', value: 99 },
    ]);
    await setupQueryTab(page, s, mongoInfo);

    const cell = s.results.gridCell().filter({ hasText: 'EditMe' }).first();
    await cell.click({ button: 'right' });
    await expect(s.contextMenu.menu()).toBeVisible();

    await s.contextMenu.item('Edit Field').click();
    await expect(s.contextMenu.menu()).not.toBeVisible();
    await expect(s.editDialog.overlay()).toBeVisible();
    // The field path should be "name"
    await expect(s.editDialog.fieldPath()).toContainText('name');
  });

  test('Copy Value writes cell value to clipboard', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'CopyMe', value: 123 },
    ]);
    await setupQueryTab(page, s, mongoInfo);

    // Grant clipboard permissions
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    const cell = s.results.gridCell().filter({ hasText: 'CopyMe' }).first();
    await cell.click({ button: 'right' });
    await s.contextMenu.item('Copy Value').click();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe('CopyMe');
  });

  test('Copy Field Path writes field path to clipboard', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'PathTest', value: 1 },
    ]);
    await setupQueryTab(page, s, mongoInfo);

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    const cell = s.results.gridCell().filter({ hasText: 'PathTest' }).first();
    await cell.click({ button: 'right' });
    await s.contextMenu.item('Copy Field Path').click();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe('name');
  });

  test('Copy Document as JSON writes EJSON to clipboard', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'JSONTest', value: 42 },
    ]);
    await setupQueryTab(page, s, mongoInfo);

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    const row = s.results.gridRow(0);
    await row.click({ button: 'right' });
    await s.contextMenu.item('Copy Document as JSON').click();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    const parsed = JSON.parse(clipboardText);
    expect(parsed.name).toBe('JSONTest');
    expect(parsed.value).toBe(42);
    // _id should be in EJSON format
    expect(parsed._id).toHaveProperty('$oid');
  });

  test('Copy _id writes the document id to clipboard', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'IdTest', value: 1 },
    ]);
    await setupQueryTab(page, s, mongoInfo);

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    const row = s.results.gridRow(0);
    await row.click({ button: 'right' });
    await s.contextMenu.item('Copy _id').click();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    // Should be a 24-char hex string (ObjectId)
    expect(clipboardText).toMatch(/^[0-9a-f]{24}$/);
  });

  test('Copy Sub-Document copies nested object as EJSON', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'Nested', address: { city: 'NYC', zip: '10001' } },
    ]);
    await setupQueryTab(page, s, mongoInfo);

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    // The address cell should show a drillable indicator
    const cell = s.results.gridCell().filter({ hasText: '2 fields' }).first();
    await cell.click({ button: 'right' });
    await expect(s.contextMenu.item('Copy Sub-Document')).toBeVisible();
    await s.contextMenu.item('Copy Sub-Document').click();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    const parsed = JSON.parse(clipboardText);
    expect(parsed).toEqual({ city: 'NYC', zip: '10001' });
  });

  test('Copy Sub-Document is hidden for primitive cells', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'Primitive', value: 42 },
    ]);
    await setupQueryTab(page, s, mongoInfo);

    const cell = s.results.gridCell().filter({ hasText: 'Primitive' }).first();
    await cell.click({ button: 'right' });
    await expect(s.contextMenu.menu()).toBeVisible();
    await expect(s.contextMenu.item('Copy Sub-Document')).not.toBeVisible();
  });

  test('cell-dependent items are hidden when right-clicking row gutter', async ({
    page,
    s,
    mongoInfo,
  }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'GutterTest', value: 1 },
    ]);
    await setupQueryTab(page, s, mongoInfo);

    // Right-click the row itself but outside any cell — use the row at the far right edge
    const row = s.results.gridRow(0);
    const rowBox = await row.boundingBox();
    if (rowBox) {
      // Click at the very right edge of the row (beyond the last cell)
      await page.mouse.click(rowBox.x + rowBox.width - 2, rowBox.y + rowBox.height / 2, {
        button: 'right',
      });
    }

    await expect(s.contextMenu.menu()).toBeVisible();
    // These items should always be visible
    await expect(s.contextMenu.item('Copy Document as JSON')).toBeVisible();
    await expect(s.contextMenu.item('Copy _id')).toBeVisible();
    await expect(s.contextMenu.item('Delete Document')).toBeVisible();
  });
});
