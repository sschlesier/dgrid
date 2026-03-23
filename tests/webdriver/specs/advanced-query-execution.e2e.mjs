import { expect } from 'expect-webdriverio';
import { ObjectId } from 'mongodb';
import {
  clearAndTypeQuery,
  createConnection,
  openCollection,
  resetApp,
  switchResultsView,
  s,
} from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB = 'e2e_advanced_query_test';
const TEST_COLLECTION = 'users';

describe('Advanced Query Execution', () => {
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

  async function openQueryTab() {
    await createConnection({
      name: 'AdvancedQueryTest',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });
    await openCollection('AdvancedQueryTest', TEST_DB, TEST_COLLECTION);
  }

  it('executes filters that use Mongo shell helpers', async () => {
    const aliceId = new ObjectId();
    await seedDatabase(TEST_DB, TEST_COLLECTION, [
      {
        _id: aliceId,
        name: 'Alice',
        createdAt: new Date('2024-01-15T10:30:00.000Z'),
      },
      {
        _id: new ObjectId(),
        name: 'Bob',
        createdAt: new Date('2024-02-15T10:30:00.000Z'),
      },
    ]);

    await openQueryTab();
    await clearAndTypeQuery(
      `db.${TEST_COLLECTION}.find({ _id: ObjectId("${aliceId.toHexString()}"), createdAt: ISODate("2024-01-15T10:30:00.000Z") })`
    );
    await (await s.query.executeButton()).click();

    await expect(s.results.gridViewport()).toBeDisplayed();
    await expect(s.results.gridViewport()).toHaveText(expect.stringContaining('Alice'));
    await expect(s.statusBar.center()).toHaveText(expect.stringContaining('Docs 1–1'));
  });

  it('executes chained explain queries and shows the planner output', async () => {
    await seedDatabase(TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
      { name: 'Charlie', age: 35 },
    ]);

    await openQueryTab();
    await clearAndTypeQuery(
      `db.${TEST_COLLECTION}.find({ age: { $gte: 25 } }).sort({ age: -1 }).explain("queryPlanner")`
    );
    await (await s.query.executeButton()).click();

    await switchResultsView('JSON');
    await expect(s.results.jsonView()).toBeDisplayed();
    await expect(s.results.jsonView()).toHaveText(expect.stringContaining('queryPlanner'));
    await expect(s.results.jsonView()).toHaveText(expect.stringContaining('winningPlan'));
  });
});
