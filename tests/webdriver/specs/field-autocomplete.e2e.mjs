import { expect } from 'expect-webdriverio';
import {
  clearAndTypeQuery,
  createConnection,
  dispatchQueryEditorCommand,
  dispatchQueryEditorKey,
  focusQueryEditor,
  getAutocompleteOptionLabels,
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

  async function waitForAutocompleteField(expectedField) {
    const editor = await s.query.editorContainer();
    await browser.waitUntil(
      async () =>
        await browser.execute(
          (el, expectedName) => {
            const bridge = el.__dgridTest;
            if (!bridge) return false;
            return bridge.getFieldNames().includes(expectedName);
          },
          editor,
          expectedField
        ),
      { timeout: 10_000, timeoutMsg: `Autocomplete field ${expectedField} was not ready` }
    );
  }

  async function openAutocomplete(query, expectedField) {
    await clearAndTypeQuery(query);
    await waitForAutocompleteField(expectedField);
    await focusQueryEditor();
    await dispatchQueryEditorCommand('dgrid:editor-start-completion');
    await s.query.autocomplete().waitForDisplayed({ timeout: 5_000 });
    await expect(s.query.autocompleteOption(expectedField)).toBeDisplayed();
  }

  async function selectedAutocompleteOptionText() {
    return await s.query.autocompleteSelectedOption().getText();
  }

  it('opens the visible autocomplete popup after navigating to a seeded collection', async () => {
    await openSeededCollection([
      { name: 'Alice', age: 30, email: 'alice@example.com' },
      { name: 'Bob', age: 25, email: 'bob@example.com' },
    ]);

    await openAutocomplete(`db.${TEST_COLLECTION}.find({ n`, 'name');
    await expect(s.query.autocomplete()).toBeDisplayed();
  });

  it('accepts the selected completion into the editor text', async () => {
    await openSeededCollection([{ name: 'Alice', age: 30 }]);

    await openAutocomplete(`db.${TEST_COLLECTION}.find({ na`, 'name');
    await dispatchQueryEditorCommand('dgrid:editor-accept-completion');

    await s.query.autocomplete().waitForDisplayed({ reverse: true, timeout: 5_000 });
    await expect(s.query.editorContent()).toHaveText(expect.stringContaining('name'));
  });

  it('renders nested dot-notation paths in the popup', async () => {
    await openSeededCollection([{ name: 'Alice', address: { city: 'NYC', zip: '10001' } }]);

    await openAutocomplete(`db.${TEST_COLLECTION}.find({ address`, 'address.city');
    await expect(s.query.autocompleteOption('address.zip')).toBeDisplayed();
  });

  it('moves the selected popup option with arrow-style commands', async () => {
    await openSeededCollection([{ name: 'Alice', nickname: 'Ally', notes: 'hello' }]);

    await openAutocomplete(`db.${TEST_COLLECTION}.find({ n`, 'name');

    const initialSelected = await selectedAutocompleteOptionText();
    await dispatchQueryEditorCommand('dgrid:editor-move-completion-down');
    const afterDown = await selectedAutocompleteOptionText();
    expect(afterDown).not.toBe(initialSelected);

    await dispatchQueryEditorCommand('dgrid:editor-move-completion-up');
    const afterUp = await selectedAutocompleteOptionText();
    expect(afterUp).toBe(initialSelected);
  });

  it('supports vim-style ctrl+j / ctrl+k navigation in the visible popup', async () => {
    await openSeededCollection([{ name: 'Alice', nickname: 'Ally', notes: 'hello' }]);

    await openAutocomplete(`db.${TEST_COLLECTION}.find({ n`, 'name');

    const initialSelected = await selectedAutocompleteOptionText();
    await dispatchQueryEditorKey({ key: 'j', code: 'KeyJ', ctrl: true });
    const afterFirstMove = await selectedAutocompleteOptionText();
    expect(afterFirstMove).not.toBe(initialSelected);

    await dispatchQueryEditorKey({ key: 'k', code: 'KeyK', ctrl: true });
    const afterSecondMove = await selectedAutocompleteOptionText();
    expect(afterSecondMove).toBe(initialSelected);
  });

  it('refines visible popup matches as the query text narrows', async () => {
    await openSeededCollection([{ name: 'Alice', age: 30, email: 'alice@example.com' }]);

    await openAutocomplete(`db.${TEST_COLLECTION}.find({ a`, 'age');
    const optionsBefore = await getAutocompleteOptionLabels();

    await clearAndTypeQuery(`db.${TEST_COLLECTION}.find({ age`);
    await focusQueryEditor();
    await dispatchQueryEditorCommand('dgrid:editor-start-completion');
    await expect(s.query.autocompleteOption('age')).toBeDisplayed();

    await browser.waitUntil(
      async () => {
        const optionsAfter = await getAutocompleteOptionLabels();
        return optionsAfter.length <= optionsBefore.length && optionsAfter.includes('age');
      },
      { timeout: 5_000, timeoutMsg: 'Autocomplete options did not refine after narrowing text' }
    );
  });

  it('shows fields discovered from query-result schema enrichment in the popup', async () => {
    await openSeededCollection([{ name: 'Alice', age: 30 }]);

    await clearAndTypeQuery(`db.${TEST_COLLECTION}.find({})`);
    await (await s.query.executeButton()).click();
    await expect(s.results.gridViewport()).toBeDisplayed();

    await openAutocomplete(`db.${TEST_COLLECTION}.find({ ag`, 'age');
  });
});
