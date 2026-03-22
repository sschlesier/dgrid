import { expect } from 'expect-webdriverio';
import { clearAndTypeQuery, createConnection, openCollection, resetApp, s } from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB = 'e2e_query_formatting_test';
const TEST_COLLECTION = 'users';

describe('Query Formatting', () => {
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

  async function openFormattingTab() {
    await seedDatabase(TEST_DB, TEST_COLLECTION, [{ name: 'Alice', age: 30 }]);
    await createConnection({
      name: 'FormatTest',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });
    await openCollection('FormatTest', TEST_DB, TEST_COLLECTION);
  }

  it('formats the active query from the toolbar button', async () => {
    await openFormattingTab();

    await clearAndTypeQuery('db.users.find({foo:1,bar:{$gt:2}}).sort({createdAt:-1})');
    await (await s.query.formatButton()).click();

    await expect(s.query.editorContent()).toHaveText(
      expect.stringContaining('db.users.find({ foo: 1, bar: { $gt: 2 } }).sort({ createdAt: -1 });')
    );
  });

  it('shows format assist suggestions for delimiter errors and can apply them', async () => {
    await openFormattingTab();

    await clearAndTypeQuery(`db.users.aggregate([
  {$match: { age: { $gt: 20 } }},
  {$project: { _id: 0 }
])`);
    await (await s.query.formatButton()).click();

    await expect(s.query.formatAssist()).toBeDisplayed();
    await expect(s.query.formatAssist()).toHaveText(expect.stringContaining('Likely fix available'));
    await (await s.query.formatAssistSuggestion('Insert }')).click();

    await expect(s.query.formatAssist()).not.toBeDisplayed();
    await expect(s.query.editorContent()).toHaveText(expect.stringContaining('{ $project: { _id: 0 } }'));
    await expect(s.query.editorContent()).not.toHaveText(expect.stringContaining('{$project: { _id: 0 }'));
    await expect(s.notification.withText('Applied fix: Insert }')).toBeDisplayed();
  });
});
