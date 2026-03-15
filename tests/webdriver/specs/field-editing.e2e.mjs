import { expect } from 'expect-webdriverio';
import { createConnection, openCollectionResults, resetApp, s } from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB = 'e2e_edit_test';
const TEST_COLLECTION = 'items';
describe('Field Editing', () => {
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

  async function setupResults(documents) {
    await seedDatabase(TEST_DB, TEST_COLLECTION, documents);
    const connectionName = `EditTest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await createConnection({
      name: connectionName,
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });
    await openCollectionResults({
      connectionName,
      database: TEST_DB,
      collection: TEST_COLLECTION,
      query: `db.${TEST_COLLECTION}.find({})`,
    });
  }

  async function openEditDialogForValue(text) {
    const cell = await s.results.gridCellWithText(text);
    await cell.click();
    await browser.execute(
      (el, isMac) => {
        el.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'e',
            metaKey: isMac,
            ctrlKey: !isMac,
            bubbles: true,
            cancelable: true,
            composed: true,
          })
        );
      },
      cell,
      process.platform === 'darwin'
    );
    await (await s.editDialog.overlay()).waitForDisplayed({ timeout: 5_000 });
  }

  it('edits a string field value', async () => {
    await setupResults([{ name: 'Original', value: 42 }]);

    await openEditDialogForValue('Original');
    await expect(await s.editDialog.fieldPath()).toHaveText('name');

    const valueInput = await s.editDialog.valueInput();
    await valueInput.clearValue();
    await valueInput.setValue('Updated');
    await (await s.editDialog.saveButton()).click();

    await (await s.editDialog.overlay()).waitForDisplayed({ reverse: true, timeout: 5_000 });
    await browser.waitUntil(
      async () => (await (await s.results.gridViewport()).getText()).includes('Updated'),
      { timeout: 10_000, timeoutMsg: 'Updated value did not appear in results' }
    );
  });

  it('changes a field type from string to number', async () => {
    await setupResults([{ name: 'TestItem', score: 'not-a-number' }]);

    await openEditDialogForValue('not-a-number');
    await (await s.editDialog.typeSelect()).selectByAttribute('value', 'number');

    const valueInput = await s.editDialog.valueInput();
    await valueInput.clearValue();
    await valueInput.setValue('99');
    await (await s.editDialog.saveButton()).click();

    await (await s.editDialog.overlay()).waitForDisplayed({ reverse: true, timeout: 5_000 });
    await browser.waitUntil(async () => (await (await s.results.gridViewport()).getText()).includes('99'), {
      timeout: 10_000,
      timeoutMsg: 'Updated numeric value did not appear in results',
    });
  });

  it('keeps the original value when edit is cancelled', async () => {
    await setupResults([{ name: 'KeepMe' }]);

    await openEditDialogForValue('KeepMe');

    const valueInput = await s.editDialog.valueInput();
    await valueInput.clearValue();
    await valueInput.setValue('Changed');
    await (await s.editDialog.cancelButton()).click();

    await (await s.editDialog.overlay()).waitForDisplayed({ reverse: true, timeout: 5_000 });
    await expect(await s.results.gridViewport()).toHaveText(expect.stringContaining('KeepMe'));
    await expect(await s.results.gridViewport()).not.toHaveText(expect.stringContaining('Changed'));
  });
});
