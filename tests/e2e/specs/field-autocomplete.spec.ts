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

const TEST_DB = 'e2e_autocomplete_test';
const TEST_COLLECTION = 'people';

test.describe('Field Autocomplete', () => {
  test.beforeEach(async ({ request, mongoInfo }) => {
    await deleteAllConnections(request);
    await cleanupDatabase(mongoInfo, TEST_DB);
  });

  test.afterEach(async ({ request, mongoInfo }) => {
    await cleanupDatabase(mongoInfo, TEST_DB);
    await deleteAllConnections(request);
  });

  test('Tab opens autocomplete after navigating to a seeded collection', async ({
    page,
    s,
    mongoInfo,
  }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', age: 30, email: 'alice@example.com' },
      { name: 'Bob', age: 25, email: 'bob@example.com' },
    ]);

    await page.goto('/');
    await createConnection(page, { name: 'AutoTest', host: mongoInfo.host, port: mongoInfo.port });
    await connectToServer(page, 'AutoTest');

    await expandTreeNode(page, TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
    await expandTreeNode(page, 'Collections');
    await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeVisible({ timeout: 10_000 });
    await s.sidebar.treeItem(TEST_COLLECTION).click();

    // Wait for editor to be ready, then position cursor inside the find({})
    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(`db.${TEST_COLLECTION}.find({ n`);

    // Press Tab to trigger autocomplete
    await page.keyboard.press('Tab');

    // Autocomplete tooltip should appear with field names
    await expect(s.query.autocomplete()).toBeVisible({ timeout: 5_000 });
    await expect(s.query.autocompleteOption('name')).toBeVisible();
  });

  test('Tab accepts a completion', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Alice', age: 30 }]);

    await page.goto('/');
    await createConnection(page, { name: 'AutoTest', host: mongoInfo.host, port: mongoInfo.port });
    await connectToServer(page, 'AutoTest');

    await expandTreeNode(page, TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
    await expandTreeNode(page, 'Collections');
    await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeVisible({ timeout: 10_000 });
    await s.sidebar.treeItem(TEST_COLLECTION).click();

    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(`db.${TEST_COLLECTION}.find({ na`);

    // Tab triggers autocomplete
    await page.keyboard.press('Tab');
    await expect(s.query.autocomplete()).toBeVisible({ timeout: 5_000 });

    // Enter accepts the selected completion
    await page.keyboard.press('Enter');
    await expect(s.query.autocomplete()).not.toBeVisible();

    // Editor should now contain "name" (the completed field)
    await expect(editor).toContainText('name');
  });

  test('nested dot-notation paths appear in autocomplete', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', address: { city: 'NYC', zip: '10001' } },
    ]);

    await page.goto('/');
    await createConnection(page, { name: 'AutoTest', host: mongoInfo.host, port: mongoInfo.port });
    await connectToServer(page, 'AutoTest');

    await expandTreeNode(page, TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
    await expandTreeNode(page, 'Collections');
    await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeVisible({ timeout: 10_000 });
    await s.sidebar.treeItem(TEST_COLLECTION).click();

    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(`db.${TEST_COLLECTION}.find({ address`);

    await page.keyboard.press('Tab');
    await expect(s.query.autocomplete()).toBeVisible({ timeout: 5_000 });

    // Should show nested paths
    await expect(s.query.autocompleteOption('address.city')).toBeVisible();
    await expect(s.query.autocompleteOption('address.zip')).toBeVisible();
  });

  test('query result enrichment adds new field names', async ({ page, s, mongoInfo }) => {
    // Seed with minimal fields
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [{ name: 'Alice', age: 30 }]);

    await page.goto('/');
    await createConnection(page, { name: 'AutoTest', host: mongoInfo.host, port: mongoInfo.port });
    await connectToServer(page, 'AutoTest');

    await expandTreeNode(page, TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeVisible({ timeout: 10_000 });
    await expandTreeNode(page, 'Collections');
    await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeVisible({ timeout: 10_000 });
    await s.sidebar.treeItem(TEST_COLLECTION).click();

    // Execute a query to get results (which enriches the schema cache)
    const editor = s.query.editorContent();
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(`db.${TEST_COLLECTION}.find({})`);
    await s.query.executeButton().click();
    await expect(s.results.gridViewport()).toBeVisible({ timeout: 10_000 });

    // Now type in the editor and trigger autocomplete
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(`db.${TEST_COLLECTION}.find({ ag`);
    await page.keyboard.press('Tab');

    await expect(s.query.autocomplete()).toBeVisible({ timeout: 5_000 });
    await expect(s.query.autocompleteOption('age')).toBeVisible();
  });
});
