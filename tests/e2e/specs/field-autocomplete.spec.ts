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

  test('arrow keys navigate the completion list', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', age: 30, email: 'alice@example.com' },
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
    await page.keyboard.type(`db.${TEST_COLLECTION}.find({ `);

    // Open autocomplete
    await page.keyboard.press('Tab');
    await expect(s.query.autocomplete()).toBeVisible({ timeout: 5_000 });

    // Note the initially selected option
    const initialSelected = await s.query.autocompleteSelectedOption().textContent();

    // Press ArrowDown to move to next option
    await page.keyboard.press('ArrowDown');
    const afterDown = await s.query.autocompleteSelectedOption().textContent();
    expect(afterDown).not.toBe(initialSelected);

    // Press ArrowUp to move back
    await page.keyboard.press('ArrowUp');
    const afterUp = await s.query.autocompleteSelectedOption().textContent();
    expect(afterUp).toBe(initialSelected);
  });

  test('Ctrl+J/K navigate the completion list', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', age: 30, email: 'alice@example.com' },
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
    await page.keyboard.type(`db.${TEST_COLLECTION}.find({ `);

    // Open autocomplete
    await page.keyboard.press('Tab');
    await expect(s.query.autocomplete()).toBeVisible({ timeout: 5_000 });

    const initialSelected = await s.query.autocompleteSelectedOption().textContent();

    // Ctrl+J moves down
    await page.keyboard.press('Control+j');
    const afterJ = await s.query.autocompleteSelectedOption().textContent();
    expect(afterJ).not.toBe(initialSelected);

    // Ctrl+K moves back up
    await page.keyboard.press('Control+k');
    const afterK = await s.query.autocompleteSelectedOption().textContent();
    expect(afterK).toBe(initialSelected);
  });

  test('typing refines completion matches', async ({ page, s, mongoInfo }) => {
    await seedDatabase(mongoInfo, TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', age: 30, email: 'alice@example.com' },
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
    await page.keyboard.type(`db.${TEST_COLLECTION}.find({ a`);

    // Open autocomplete — should show both 'age' and 'age'-matching fields
    await page.keyboard.press('Tab');
    await expect(s.query.autocomplete()).toBeVisible({ timeout: 5_000 });

    // Multiple options visible (age, _id matches 'a' too, etc.)
    const optionsBefore = await page
      .locator('.cm-tooltip-autocomplete .cm-completionLabel')
      .count();

    // Type more to narrow down
    await page.keyboard.type('ge');
    await expect(s.query.autocompleteOption('age')).toBeVisible();

    const optionsAfter = await page.locator('.cm-tooltip-autocomplete .cm-completionLabel').count();
    expect(optionsAfter).toBeLessThanOrEqual(optionsBefore);
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
