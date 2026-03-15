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
    await expect(s.sidebar.treeItem(TEST_DB)).toBeDisplayed();
    await expandTreeNode(TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeDisplayed();
    await browser.waitUntil(async () => (await (await s.sidebar.treeItem(TEST_COLLECTION)).isDisplayed()), {
      timeout: 10_000,
      timeoutMsg: `Collection ${TEST_COLLECTION} did not appear after expanding ${TEST_DB}`,
    }).catch(async () => {
      await expandTreeNode('Collections');
    });
    await expect(s.sidebar.treeItem(TEST_COLLECTION)).toBeDisplayed();
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

    await expect(s.results.gridViewport()).toBeDisplayed();
    await expect(s.results.gridViewport()).toHaveText(expect.stringContaining('Alice'));
    await expect(s.results.gridViewport()).toHaveText(expect.stringContaining('Bob'));
  });

  it('shows an error display for invalid queries', async () => {
    await seedDatabase(TEST_DB, TEST_COLLECTION, [{ name: 'Alice' }]);

    await openCollection();
    const editor = await s.query.editorContent();
    await editor.click();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await browser.keys([modifier, 'ArrowRight']);
    await browser.keys('Backspace');
    await (await s.query.executeButton()).click();

    await s.query.errorDisplay().waitForDisplayed({ timeout: 10_000 });
    await expect(s.query.errorDisplay()).toBeDisplayed();
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

    await expect(s.results.pagination()).toBeDisplayed();
    await expect(s.results.paginationCount()).toHaveText('Docs 1–50');
    await expect(s.results.pageInfo()).toHaveText('Page 1');
    await (await s.results.nextPageButton()).click();
    await expect(s.results.paginationCount()).toHaveText('Docs 51–60');
    await expect(s.results.pageInfo()).toHaveText('Page 2');
  });

  it('shows document count and execution time in the status bar', async () => {
    await seedDatabase(TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);

    await openCollection();
    await clearAndTypeQuery(`db.${TEST_COLLECTION}.find({})`);
    await (await s.query.executeButton()).click();

    await expect(s.statusBar.center()).toHaveText(expect.stringContaining('Docs 1–2'));
    await expect(s.statusBar.center()).toHaveText(expect.stringContaining('ms'));
  });
});
