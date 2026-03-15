import { expect } from 'expect-webdriverio';
import {
  clearAndTypeQuery,
  createConnection,
  openCollection,
  resetApp,
  s,
} from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB = 'e2e_autocomplete_test';
const TEST_COLLECTION = 'people';

describe('Field Autocomplete', () => {
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

  async function openSeededCollection(documents) {
    await seedDatabase(TEST_DB, TEST_COLLECTION, documents);
    const connectionName = `AutoTest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await createConnection({
      name: connectionName,
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });
    await openCollection(connectionName, TEST_DB, TEST_COLLECTION);
  }

  async function setAutocompleteFields(fields) {
    const editor = await s.query.editorContainer();
    await browser.execute(
      (el, nextFields) => {
        el.__dgridTest?.setFieldNames(nextFields);
      },
      editor,
      fields
    );
  }

  async function triggerAutocomplete(query, expectedField) {
    await clearAndTypeQuery(query);
    const editor = await s.query.editorContainer();
    await browser.waitUntil(
      async () =>
        await browser.execute(
          (el, expectedName) => {
            const bridge = el.__dgridTest;
            if (!bridge) return false;
            const fields = bridge.getFieldNames();
            return fields.length > 0 && fields.includes(expectedName);
          },
          editor,
          expectedField
        ),
      { timeout: 10_000, timeoutMsg: 'Autocomplete field names were not ready' }
    );
    return editor;
  }

  it('exposes seeded field names to the editor autocomplete bridge', async () => {
    await openSeededCollection([
      { name: 'Alice', age: 30, email: 'alice@example.com' },
      { name: 'Bob', age: 25, email: 'bob@example.com' },
    ]);
    await setAutocompleteFields(['name', 'age', 'email']);

    const editor = await triggerAutocomplete(`db.${TEST_COLLECTION}.find({ n`, 'name');
    const fieldNames = await browser.execute((el) => el.__dgridTest?.getFieldNames() ?? [], editor);
    expect(fieldNames).toContain('name');
    expect(fieldNames).toContain('email');
  });

  it('applies a completion into the editor text', async () => {
    await openSeededCollection([{ name: 'Alice', age: 30 }]);
    await setAutocompleteFields(['name', 'age']);

    const editor = await triggerAutocomplete(`db.${TEST_COLLECTION}.find({ na`, 'name');
    await browser.execute((el) => {
      el.__dgridTest?.applyCompletion('name');
    }, editor);
    await expect(await s.query.editorContent()).toHaveText(expect.stringContaining('name'));
  });

  it('supports nested dot-notation fields', async () => {
    await openSeededCollection([{ name: 'Alice', address: { city: 'NYC', zip: '10001' } }]);
    await setAutocompleteFields(['name', 'address.city', 'address.zip']);

    const editor = await triggerAutocomplete(`db.${TEST_COLLECTION}.find({ address`, 'address.city');
    const fieldNames = await browser.execute((el) => el.__dgridTest?.getFieldNames() ?? [], editor);
    expect(fieldNames).toContain('address.city');
    expect(fieldNames).toContain('address.zip');
  });
});
