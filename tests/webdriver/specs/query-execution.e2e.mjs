import { expect } from 'expect-webdriverio';
import {
  clearAndTypeQuery,
  connectToServer,
  createConnection,
  expandTreeNode,
  resetApp,
  s,
} from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB = 'e2e_query_test';
const TEST_COLLECTION = 'users';

describe('Query Execution', () => {
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

  async function openCollection() {
    await createConnection({
      name: 'QueryTest',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });
    await connectToServer('QueryTest');
    await expect(await s.sidebar.treeItem(TEST_DB)).toBeDisplayed();
    await expandTreeNode(TEST_DB);
    await expect(await s.sidebar.treeItem('Collections')).toBeDisplayed();
    await browser.waitUntil(async () => (await (await s.sidebar.treeItem(TEST_COLLECTION)).isDisplayed()), {
      timeout: 10_000,
      timeoutMsg: `Collection ${TEST_COLLECTION} did not appear after expanding ${TEST_DB}`,
    }).catch(async () => {
      await expandTreeNode('Collections');
    });
    await expect(await s.sidebar.treeItem(TEST_COLLECTION)).toBeDisplayed();
    await (await s.sidebar.treeItem(TEST_COLLECTION)).click();
  }

  it('executes a find query and renders results', async () => {
    await seedDatabase(TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
      { name: 'Charlie', age: 35 },
    ]);

    await openCollection();
    await clearAndTypeQuery(`db.${TEST_COLLECTION}.find({})`);
    await (await s.query.executeButton()).click();

    await expect(await s.results.gridViewport()).toBeDisplayed();
    await expect(await s.results.gridViewport()).toHaveText(expect.stringContaining('Alice'));
    await expect(await s.results.gridViewport()).toHaveText(expect.stringContaining('Bob'));
  });

  it('shows an error display for invalid queries', async () => {
    await seedDatabase(TEST_DB, TEST_COLLECTION, [{ name: 'Alice' }]);

    await openCollection();
    await clearAndTypeQuery('db.users.find({invalid syntax!!!');
    await (await s.query.executeButton()).click();

    await expect(await s.query.errorDisplay()).toBeDisplayed();
  });

  it('paginates a result set larger than 50 documents', async () => {
    const docs = Array.from({ length: 60 }, (_, index) => ({
      name: `User ${String(index + 1).padStart(3, '0')}`,
      index: index + 1,
    }));
    await seedDatabase(TEST_DB, TEST_COLLECTION, docs);

    await openCollection();
    await clearAndTypeQuery(`db.${TEST_COLLECTION}.find({})`);
    await (await s.query.executeButton()).click();

    await expect(await s.results.pagination()).toBeDisplayed();
    await expect(await s.results.paginationCount()).toHaveText(expect.stringContaining('60 documents'));
    await expect(await s.results.pageInfo()).toHaveText(expect.stringContaining('Page 1 of 2'));
    await (await s.results.nextPageButton()).click();
    await expect(await s.results.pageInfo()).toHaveText(expect.stringContaining('Page 2 of 2'));
  });

  it('shows document count and execution time in the status bar', async () => {
    await seedDatabase(TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);

    await openCollection();
    await clearAndTypeQuery(`db.${TEST_COLLECTION}.find({})`);
    await (await s.query.executeButton()).click();

    await expect(await s.statusBar.center()).toHaveText(expect.stringContaining('2 documents'));
    await expect(await s.statusBar.center()).toHaveText(expect.stringContaining('ms'));
  });
});
