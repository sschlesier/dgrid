import { expect } from 'expect-webdriverio';
import { createConnection, openCollection, resetApp, s } from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB = 'e2e_export_test';
const TEST_COLLECTION = 'items';

describe('Export UI', () => {
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

  async function openCollectionWithResults(documents) {
    await seedDatabase(TEST_DB, TEST_COLLECTION, documents);
    const connectionName = `ExportTest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await createConnection({
      name: connectionName,
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });
    await openCollection(connectionName, TEST_DB, TEST_COLLECTION);
  }

  async function setExportState(tabId, state) {
    await browser.execute(
      (nextTabId, nextState) => {
        window.dispatchEvent(
          new CustomEvent('dgrid:e2e-set-export-state', {
            detail: { tabId: nextTabId, state: nextState },
          })
        );
      },
      tabId,
      state
    );
  }

  it('shows the export button only after results are available', async () => {
    await openCollectionWithResults([{ name: 'Alice' }]);

    await expect(await s.results.exportButton()).not.toExist();

    await (await s.query.executeButton()).click();
    await (await s.results.gridViewport()).waitForDisplayed({ timeout: 10_000 });
    await expect(await s.results.exportButton()).toBeDisplayed();
    await expect(await s.results.exportButton()).toHaveText(expect.stringContaining('Export CSV'));
  });

  it('renders the export overlay from store state', async () => {
    await openCollectionWithResults([
      { name: 'Alice' },
      { name: 'Bob' },
      { name: 'Charlie' },
    ]);

    await (await s.query.executeButton()).click();
    await (await s.results.gridViewport()).waitForDisplayed({ timeout: 10_000 });

    const tabId = await (await s.results.container()).getAttribute('data-tab-id');
    await setExportState(tabId, {
      isExporting: true,
      exportedCount: 10,
      totalCount: 25,
      error: null,
    });

    await expect(await s.exportOverlay.overlay()).toBeDisplayed();
    await expect(await s.exportOverlay.status()).toHaveText(
      expect.stringContaining('Exporting 10 / 25 documents')
    );
    await expect(await s.exportOverlay.cancelButton()).toBeDisplayed();

    await setExportState(tabId, {
      isExporting: false,
      exportedCount: 25,
      totalCount: 25,
      error: null,
    });

    await expect(await s.exportOverlay.overlay()).not.toBeDisplayed();
  });
});
