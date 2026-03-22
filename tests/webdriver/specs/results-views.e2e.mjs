import { expect } from 'expect-webdriverio';
import {
  createConnection,
  openCollectionResults,
  resetApp,
  switchResultsView,
  s,
} from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB = 'e2e_views_test';
const TEST_COLLECTION = 'items';

describe('Results View Modes', () => {
  let runtime;

  before(async () => {
    runtime = await readRuntimeInfo();
  });

  beforeEach(async () => {
    await cleanupDatabase(TEST_DB);
    await seedDatabase(TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
    await resetApp();
  });

  afterEach(async () => {
    await cleanupDatabase(TEST_DB);
  });

  async function setupWithResults() {
    await createConnection({
      name: 'ViewsTest',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });
    await openCollectionResults({
      connectionName: 'ViewsTest',
      database: TEST_DB,
      collection: TEST_COLLECTION,
      query: `db.${TEST_COLLECTION}.find({})`,
    });
  }

  it('switches through Table, JSON, Tree, and back to Table', async () => {
    await setupWithResults();

    await expect(s.results.gridViewport()).toBeDisplayed();
    await expect(s.results.exportButton()).toBeDisplayed();
    await expect(s.results.exportButton()).toHaveText('Export CSV');
    await expect(s.results.viewButton('Table')).toHaveAttribute(
      'class',
      expect.stringContaining('active')
    );

    await switchResultsView('JSON');
    await expect(s.results.jsonView()).toBeDisplayed();
    await expect(s.results.gridViewport()).not.toBeDisplayed();
    await expect(s.results.viewButton('JSON')).toHaveAttribute(
      'class',
      expect.stringContaining('active')
    );

    await switchResultsView('Tree');
    await expect(s.results.treeView()).toBeDisplayed();
    await expect(s.results.gridViewport()).not.toBeDisplayed();
    await expect(s.results.viewButton('Tree')).toHaveAttribute(
      'class',
      expect.stringContaining('active')
    );

    await switchResultsView('Table');
    await expect(s.results.gridViewport()).toBeDisplayed();
    await expect(s.results.treeView()).not.toBeDisplayed();
    await expect(s.results.viewButton('Table')).toHaveAttribute(
      'class',
      expect.stringContaining('active')
    );
  });

  it('hides the export button before any query results exist', async () => {
    await createConnection({
      name: 'ViewsTest',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });

    await expect(s.sidebar.treeItem('ViewsTest')).toBeDisplayed();
    await expect(s.results.exportButton()).not.toExist();
  });
});
