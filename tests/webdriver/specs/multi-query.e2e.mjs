import { expect } from 'expect-webdriverio';
import {
  clearAndTypeQuery,
  createConnection,
  openCollection,
  resetApp,
  setQueryCursor,
  s,
} from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB = 'e2e_multi_query_test';
const COLLECTION_A = 'users';
const COLLECTION_B = 'orders';

describe('Multi-Query Execution', () => {
  let runtime;

  before(async () => {
    runtime = await readRuntimeInfo();
  });

  beforeEach(async () => {
    await cleanupDatabase(TEST_DB);
    await resetApp();
  });

  afterEach(async () => {
    await cleanupDatabase(TEST_DB);
  });

  async function setupAndNavigate() {
    await seedDatabase(TEST_DB, COLLECTION_A, [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
    await seedDatabase(TEST_DB, COLLECTION_B, [
      { product: 'Widget', price: 10 },
      { product: 'Gadget', price: 20 },
    ]);

    const connectionName = `MultiTest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await createConnection({
      name: connectionName,
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });

    await openCollection(connectionName, TEST_DB, COLLECTION_A);
  }

  async function runQuery(query) {
    await clearAndTypeQuery(query);
    await (await s.query.executeButton()).click();
  }

  it('shows sub-result tabs when Run All executes two queries', async () => {
    await setupAndNavigate();

    await runQuery(`db.${COLLECTION_A}.find({})\ndb.${COLLECTION_B}.find({})`);

    await expect(s.query.subResultTabs()).toBeDisplayed();
    await expect(await s.query.subResultTab(0)).toBeDisplayed();
    await expect(await s.query.subResultTab(1)).toBeDisplayed();
    await expect(await s.query.subResultTab(0)).toHaveAttribute(
      'class',
      expect.stringContaining('active')
    );
    await expect(s.results.gridViewport()).toBeDisplayed();
    await expect(s.results.gridViewport()).toHaveText(expect.stringContaining('Alice'));
  });

  it('switches between sub-result tabs', async () => {
    await setupAndNavigate();

    await runQuery(`db.${COLLECTION_A}.find({})\ndb.${COLLECTION_B}.find({})`);

    await expect(s.query.subResultTabs()).toBeDisplayed();
    await expect(s.results.gridViewport()).toHaveText(expect.stringContaining('Alice'));

    await (await s.query.subResultTab(1)).click();
    await expect(await s.query.subResultTab(1)).toHaveAttribute(
      'class',
      expect.stringContaining('active')
    );
    await expect(s.results.gridViewport()).toHaveText(expect.stringContaining('Widget'));
  });

  it('does not show sub-result tabs for a single query', async () => {
    await setupAndNavigate();

    await runQuery(`db.${COLLECTION_A}.find({})`);

    await expect(s.results.gridViewport()).toBeDisplayed();
    await expect(s.results.gridViewport()).toHaveText(expect.stringContaining('Alice'));
    await expect(s.query.subResultTabs()).not.toExist();
  });

  it('shows an error tab alongside successful results when one query fails', async () => {
    await setupAndNavigate();

    await runQuery(`db.${COLLECTION_A}.find({})\ndb.${COLLECTION_A}.find({invalid syntax!!!`);

    await expect(s.query.subResultTabs()).toBeDisplayed();
    await expect(await s.query.subResultTab(0)).toBeDisplayed();
    await expect(s.results.gridViewport()).toBeDisplayed();
    await expect(s.results.gridViewport()).toHaveText(expect.stringContaining('Alice'));
    await expect(s.query.subResultTabWithError()).toBeDisplayed();

    await (await s.query.subResultTab(1)).click();
    await expect(s.query.errorDisplay()).toBeDisplayed();
  });

  it('shows all execute mode options in the dropdown', async () => {
    await setupAndNavigate();

    await (await s.query.executeDropdownToggle()).click();

    await expect(s.query.executeDropdown()).toBeDisplayed();
    await expect(s.query.executeDropdownItem('Run All')).toBeDisplayed();
    await expect(s.query.executeDropdownItem('Run Current')).toBeDisplayed();
    await expect(s.query.executeDropdownItem('Run Selected')).toBeDisplayed();
  });

  it('runs only the current query at the cursor', async () => {
    await setupAndNavigate();

    await clearAndTypeQuery(`db.${COLLECTION_A}.find({})\ndb.${COLLECTION_B}.find({})`);
    await setQueryCursor(0);
    await (await s.query.executeDropdownToggle()).click();
    await (await s.query.executeDropdownItem('Run Current')).click();

    await expect(s.results.gridViewport()).toBeDisplayed();
    await expect(s.results.gridViewport()).toHaveText(expect.stringContaining('Alice'));
    await expect(s.results.gridViewport()).not.toHaveText(expect.stringContaining('Widget'));
    await expect(s.query.subResultTabs()).not.toExist();
  });

  it('shows indexed sub-result info in the status bar', async () => {
    await setupAndNavigate();

    await runQuery(`db.${COLLECTION_A}.find({})\ndb.${COLLECTION_B}.find({})`);

    await expect(s.query.subResultTabs()).toBeDisplayed();
    await expect(s.statusBar.center()).toHaveText(expect.stringContaining('[1/2]'));
    await expect(s.statusBar.center()).toHaveText(expect.stringContaining('Docs 1–2'));
  });

  it('treats a chained multi-line query as a single query', async () => {
    await setupAndNavigate();

    await runQuery(`db.${COLLECTION_A}.find({})\n  .limit(1)`);

    await expect(s.results.gridViewport()).toBeDisplayed();
    await expect(s.query.subResultTabs()).not.toExist();
    await expect(s.statusBar.center()).toHaveText(expect.stringContaining('Docs 1–1'));
  });
});
