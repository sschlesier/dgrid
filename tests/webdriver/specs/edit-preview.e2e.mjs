import { expect } from 'expect-webdriverio';
import { createConnection, openCollectionResults, resetApp, s } from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB = 'e2e_edit_preview_test';
const TEST_COLLECTION = 'items';

describe('Edit Preview', () => {
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

  async function openResults(query, documents) {
    await seedDatabase(TEST_DB, TEST_COLLECTION, documents);
    const connectionName = `EditPreview-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await createConnection({
      name: connectionName,
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });
    await openCollectionResults({
      connectionName,
      database: TEST_DB,
      collection: TEST_COLLECTION,
      query,
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
    await s.editDialog.overlay().waitForDisplayed({ timeout: 5_000 });
  }

  it('updates the preview query as the edited value changes and supports copy', async () => {
    await openResults(`db.${TEST_COLLECTION}.find({})`, [{ name: 'Original', status: 'active' }]);

    await openEditDialogForValue('Original');
    const valueInput = await s.editDialog.valueInput();
    await valueInput.clearValue();
    await valueInput.setValue('Updated');

    await expect(s.editDialog.updatePreview()).toHaveText(expect.stringContaining('"name": "Updated"'));
    await expect(s.editDialog.updatePreview()).toHaveText(expect.stringContaining('updateOne'));

    await (await s.editDialog.copyPreviewButton()).click();
    await expect(s.editDialog.copyPreviewButton()).toHaveAttribute('title', 'Copied!');
  });

  it('shows a blocking warning when the result has no source _id', async () => {
    await openResults(`db.${TEST_COLLECTION}.find({}, { name: 1, _id: 0 })`, [{ name: 'NoId' }]);

    await openEditDialogForValue('NoId');

    await expect(s.editDialog.missingIdWarning()).toBeDisplayed();
    await expect(s.editDialog.missingIdWarning()).toHaveText(
      expect.stringContaining('no source `_id`')
    );
    await expect(s.editDialog.updatePreview()).toHaveText(expect.stringContaining('<missing _id>'));
    await expect(s.editDialog.saveButton()).toBeDisabled();
  });

  it('warns when the source query rewrites _id', async () => {
    await openResults(
      `db.${TEST_COLLECTION}.aggregate([{ $project: { _id: "$legacyId", name: 1, total: 1 } }, { $set: { _id: "$name" } }])`,
      [{ legacyId: 'legacy-1', name: 'Alice', total: 1 }]
    );

    await openEditDialogForValue('1');

    await expect(s.editDialog.idManipulatedWarning()).toBeDisplayed();
    await expect(s.editDialog.idManipulatedWarning()).toHaveText(
      expect.stringContaining('changes `_id`')
    );
    await expect(s.editDialog.saveButton()).not.toBeDisabled();
  });
});
