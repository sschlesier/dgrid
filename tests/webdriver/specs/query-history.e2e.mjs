import { expect } from 'expect-webdriverio';
import {
  clearAndTypeQuery,
  createConnection,
  openCollection,
  openQueryHistory,
  resetApp,
  s,
} from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB = 'e2e_history_test';
const TEST_COLLECTION = 'items';

describe('Query History', () => {
  let runtime;

  before(async () => {
    runtime = await readRuntimeInfo();
  });

  beforeEach(async () => {
    await cleanupDatabase(TEST_DB);
    await seedDatabase(TEST_DB, TEST_COLLECTION, [{ name: 'Alice', age: 30 }]);
    await resetApp();
  });

  afterEach(async () => {
    await cleanupDatabase(TEST_DB);
  });

  async function setupQueryTab() {
    await createConnection({
      name: 'HistoryTest',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });
    await openCollection('HistoryTest', TEST_DB, TEST_COLLECTION);
  }

  async function runDefaultQuery() {
    await clearAndTypeQuery(`db.${TEST_COLLECTION}.find({})`);
    await (await s.query.executeButton()).click();
    await expect(s.results.gridViewport()).toBeDisplayed();
  }

  it('shows an executed query in history', async () => {
    await setupQueryTab();
    await runDefaultQuery();

    await openQueryHistory();

    await browser.waitUntil(async () => (await s.history.item()).length > 0, {
      timeout: 5_000,
      timeoutMsg: 'Expected at least one query history entry',
    });
    await expect((await s.history.item())[0]).toBeDisplayed();
    await expect((await s.history.itemQuery())[0]).toHaveText(expect.stringContaining('db.items.find'));
  });

  it('restores a history entry back into the editor', async () => {
    await setupQueryTab();
    await runDefaultQuery();

    await clearAndTypeQuery('db.items.find({ name: "Bob" })');
    await openQueryHistory();
    await (await s.history.item())[0].click();
    await s.history.dropdown().waitForDisplayed({ reverse: true, timeout: 5_000 });

    await browser.waitUntil(
      async () => (await (await s.query.editorContent()).getText()).includes('db.items.find({})'),
      {
        timeout: 5_000,
        timeoutMsg: 'Expected the previous query to be restored into the editor',
      }
    );
  });

  it('clears all query history entries', async () => {
    await setupQueryTab();
    await runDefaultQuery();

    await openQueryHistory();
    await browser.waitUntil(async () => (await s.history.item()).length > 0, {
      timeout: 5_000,
      timeoutMsg: 'Expected at least one query history entry before clearing',
    });
    await (await s.history.clearButton()).click();

    await expect(s.history.emptyState()).toBeDisplayed();
    await browser.waitUntil(async () => (await s.history.item()).length === 0, {
      timeout: 5_000,
      timeoutMsg: 'Expected query history to be empty after clearing',
    });
  });
});
