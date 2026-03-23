import { expect } from 'expect-webdriverio';
import { connectToServer, createConnection, expandTreeNode, resetApp, s } from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

const TEST_DB = 'e2e_collection_tooltip_test';
const TEST_COLLECTION = 'people';

describe('Collection Tooltip', () => {
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

  it('shows collection stats when hovering a collection node', async () => {
    await seedDatabase(TEST_DB, TEST_COLLECTION, [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
      { name: 'Charlie', age: 35 },
    ]);

    await createConnection({
      name: 'TooltipTest',
      host: runtime.mongo.host,
      port: runtime.mongo.port,
    });

    await connectToServer('TooltipTest');
    await expect(s.sidebar.treeItem(TEST_DB)).toBeDisplayed();
    await expandTreeNode(TEST_DB);
    await expect(s.sidebar.treeItem('Collections')).toBeDisplayed();
    await expandTreeNode('Collections');

    const collectionNode = await s.sidebar.treeItem(TEST_COLLECTION);
    await expect(collectionNode).toBeDisplayed();
    await browser.execute((el) => {
      el.dispatchEvent(
        new MouseEvent('mouseenter', {
          bubbles: true,
          cancelable: true,
          composed: true,
        })
      );
    }, collectionNode);

    await browser.waitUntil(async () => await s.tooltip.collection().isDisplayed(), {
      timeout: 5_000,
      timeoutMsg: 'Collection tooltip did not appear on hover',
    });

    await expect(s.tooltip.collection()).toHaveText(expect.stringContaining(TEST_COLLECTION));
    await expect(s.tooltip.collection()).toHaveText(expect.stringContaining('collection'));
    await browser.waitUntil(
      async () => (await s.tooltip.collection().getText()).includes('Documents'),
      {
        timeout: 10_000,
        timeoutMsg: 'Collection tooltip stats did not load',
      }
    );
    await expect(s.tooltip.collection()).toHaveText(expect.stringContaining('Documents'));
    await expect(s.tooltip.collection()).toHaveText(expect.stringContaining('3'));
    await expect(s.tooltip.collection()).toHaveText(expect.stringContaining('Avg size'));
    await expect(s.tooltip.collection()).toHaveText(expect.stringContaining('Total size'));
  });
});
