import { expect } from 'expect-webdriverio';
import {
  createConnection,
  openCollectionResults,
  openContextMenuFromFocusedCell,
  resetApp,
  s,
} from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB = 'e2e_context_menu';
const TEST_COLLECTION = 'items';

describe('Grid Context Menu', () => {
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
    const connectionName = `CtxMenuTest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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

  async function getMenuLabels() {
    return await browser.execute(() =>
      Array.from(document.querySelectorAll('.context-menu .context-menu-item')).map((button) =>
        button.textContent?.trim()
      )
    );
  }

  it('shows the current cell context menu items', async () => {
    await setupResults([{ name: 'Alice', value: 42 }]);

    const cell = await s.results.gridCellWithText('Alice');
    await openContextMenuFromFocusedCell(cell);
    const labels = await getMenuLabels();
    expect(labels).toContain('Edit Field');
    expect(labels).toContain('Copy Value');
    expect(labels).toContain('Copy Field Path');
    expect(labels).toContain('Copy Document as JSON');
    expect(labels).toContain('Copy _id');
    expect(labels).toContain('Delete Document');
    await expect(s.contextMenu.separator()).toBeDisplayed();
  });

  it('opens the edit dialog for the selected cell', async () => {
    await setupResults([{ name: 'EditMe', value: 99 }]);

    const cell = await s.results.gridCellWithText('EditMe');
    await openContextMenuFromFocusedCell(cell);
    await (await s.contextMenu.item('Edit Field')).click();

    await expect(s.editDialog.overlay()).toBeDisplayed();
    await expect(s.editDialog.fieldPath()).toHaveText('name');
  });

  it('deletes a document after confirmation', async () => {
    await setupResults([
      { name: 'ToDelete', value: 1 },
      { name: 'ToKeep', value: 2 },
    ]);

    await expect(s.results.gridViewport()).toHaveText(expect.stringContaining('ToDelete'));
    const cell = await s.results.gridCellWithText('ToDelete');
    await openContextMenuFromFocusedCell(cell);
    await browser.execute(() => {
      window.confirm = () => true;
    });
    await (await s.contextMenu.item('Delete Document')).click();

    await browser.waitUntil(
      async () => !(await (await s.results.gridViewport()).getText()).includes('ToDelete'),
      { timeout: 10_000, timeoutMsg: 'Deleted document still visible in results' }
    );
    await expect(s.results.gridViewport()).toHaveText(expect.stringContaining('ToKeep'));
  });

  it('keeps the document when delete is cancelled', async () => {
    await setupResults([{ name: 'StayHere', value: 1 }]);

    const cell = await s.results.gridCellWithText('StayHere');
    await openContextMenuFromFocusedCell(cell);
    await browser.execute(() => {
      window.confirm = () => false;
    });
    await (await s.contextMenu.item('Delete Document')).click();

    await expect(s.results.gridViewport()).toHaveText(expect.stringContaining('StayHere'));
  });
});
