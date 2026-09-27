# E2E Testing Conventions (WebdriverIO)

E2E tests drive the real Tauri app through WebdriverIO + mocha and the `tauri-webdriver`
driver, against a throwaway MongoDB (`mongodb-memory-server`) that the runner starts for
each run. The old Playwright suite in `tests/e2e/` is reference only; see `tests/e2e/README.md`.

## File Organization

- Test specs: `tests/webdriver/specs/{feature}.e2e.mjs`
- Selectors: `tests/webdriver/selectors.mjs`
- App-action helpers: `tests/webdriver/helpers.mjs` (also re-exports the selectors as `s`)
- Runtime info and MongoDB seeding: `tests/webdriver/runtime.mjs`
- WebdriverIO config: `tests/webdriver/wdio.conf.mjs`
- Runner (builds the app, starts MongoDB and the driver, runs wdio): `scripts/run-tauri-e2e.mjs`

Specs are plain ES modules (`.mjs`), not TypeScript.

## Imports

Import `expect` from `expect-webdriverio`, app actions and `s` from `../helpers.mjs`, and
MongoDB/runtime helpers from `../runtime.mjs`. `browser`, `$` and `$$` are WebdriverIO
globals and need no import.

```js
// Good
import { expect } from 'expect-webdriverio';
import { clearAndTypeQuery, createConnection, openCollection, resetApp, s } from '../helpers.mjs';
import { cleanupDatabase, readRuntimeInfo, seedDatabase } from '../runtime.mjs';

// Bad — reaching past helpers.mjs for selectors, or importing expect from somewhere else
import { selectors } from '../selectors.mjs';
```

## Test Structure

Use mocha `describe` / `it` with `before` / `beforeEach` / `afterEach` hooks. Every helper is
async, so `await` everything. Adapted from `tests/webdriver/specs/query-execution.e2e.mjs`:

```js
const TEST_DB = 'e2e_query_test';
const TEST_COLLECTION = 'users';

describe('Query Execution', () => {
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

  it('executes a find query and renders results', async () => {
    await seedDatabase(TEST_DB, TEST_COLLECTION, [{ name: 'Alice' }, { name: 'Bob' }]);
    // ...open the collection, run the query, assert on the grid
  });
});
```

## Test Isolation

Each test starts from a clean app and a clean database:

- `readRuntimeInfo()` (in `runtime.mjs`) reads the JSON file the runner writes (path in
  `DGRID_E2E_RUNTIME_FILE`). Use `runtime.mongo.host` and `runtime.mongo.port` to create
  connections. Call it once in `before`.
- `resetApp()` (in `helpers.mjs`) empties the saved connections in the app's data dir,
  clears `localStorage`, reloads the webview and waits for the header to render. Call it
  in `beforeEach`.
- `cleanupDatabase(db)` drops the test database; call it in `beforeEach` and `afterEach`.
  `seedDatabase(db, collection, docs)` inserts documents directly through the MongoDB
  driver, bypassing the app.
- Give each spec its own database name (`e2e_<feature>_test`) so specs never share data.
- The runner points the app at a temp data dir (`DGRID_DATA_DIR`), mock passwords and a
  per-run keyring service, so tests never touch your real connections or keychain.

## Selectors

All selectors live in `tests/webdriver/selectors.mjs`, grouped by UI area (`header`,
`sidebar`, `connectionDialog`, `shortcutsModal`, `query`, `tabs`, `results`, `contextMenu`,
`confirmDialog`, `editDialog`, `exportOverlay`, `statusBar`, `notification`, `tooltip`,
`history`). Each entry is a function returning a WebdriverIO element. Never inline selectors
in specs.

```js
// Good — use the `s` export from helpers.mjs
await (await s.query.executeButton()).click();
await expect(s.results.gridViewport()).toBeDisplayed();

// Bad — hardcoded selector in the spec
await $('.execute-btn.split-main').click();
```

When you need a new selector, add it to the right group in `selectors.mjs` and use it via `s`.
Text-based lookups (e.g. `s.sidebar.treeItem(name)`) use XPath and escape quotes in the text
for you.

## MongoDB Setup

The runner starts `mongodb-memory-server`, so there is nothing to start yourself. Seed data
with `seedDatabase` and connect with the runtime host/port:

```js
await seedDatabase(TEST_DB, TEST_COLLECTION, [{ name: 'Alice', age: 30 }]);
await createConnection({
  name: 'QueryTest',
  host: runtime.mongo.host,
  port: runtime.mongo.port,
});
await openCollection('QueryTest', TEST_DB, TEST_COLLECTION);
```

## Common Patterns

### Create and connect

```js
await createConnection({ name: 'QueryTest', host: runtime.mongo.host, port: runtime.mongo.port });
await connectToServer('QueryTest');
await expect(s.sidebar.treeItem(TEST_DB)).toBeDisplayed();
```

`createConnectionViaUri({ name, uri })` does the same through the URI tab. `expandTreeNode(name)`
expands one sidebar node; `openCollection(connectionName, database, collection)` connects,
expands the database and its Collections node and opens the collection.

### Execute a query

```js
await clearAndTypeQuery(`db.${TEST_COLLECTION}.find({})`);
await (await s.query.executeButton()).click();
await expect(s.results.gridViewport()).toBeDisplayed();
await expect(s.results.gridViewport()).toHaveText(expect.stringContaining('Alice'));
```

`openCollectionResults({ connectionName, database, collection, query })` combines
`openCollection`, `clearAndTypeQuery`, the execute click and the grid wait.

### Driving the query editor (`__dgridTest` bridge)

CodeMirror can't be driven reliably with raw keystrokes over WebDriver.
`src/components/Editor.svelte` exposes a test
bridge on the editor container element as `el.__dgridTest` (`setValue`, `setSelection`,
`getFieldNames`, `setFieldNames`, completion commands) and listens for `dgrid:editor-*`
custom events. Use the helpers instead of typing:

- `clearAndTypeQuery(query)` — replace the editor text via `__dgridTest.setValue`
- `setQueryCursor(offset)` — move the cursor via `__dgridTest.setSelection`
- `focusQueryEditor()` — click into the editor content
- `dispatchQueryEditorCommand(type)` — dispatch a `dgrid:editor-*` event on the editor
  container (`dgrid:editor-start-completion`, `dgrid:editor-accept-completion`,
  `dgrid:editor-move-completion-down`, `dgrid:editor-move-completion-up`)
- `dispatchQueryEditorKey({ key, code, ctrl, meta, shift, alt })` — dispatch a `keydown` on
  the editor content (for editor keybindings such as Ctrl+J / Ctrl+K)
- `getAutocompleteOptionLabels()` — read the labels in the open completion popup

Adapted from `tests/webdriver/specs/field-autocomplete.e2e.mjs`:

```js
await clearAndTypeQuery(`db.${TEST_COLLECTION}.find({ n`);
await focusQueryEditor();
await dispatchQueryEditorCommand('dgrid:editor-start-completion');
await s.query.autocomplete().waitForDisplayed({ timeout: 5_000 });
await expect(s.query.autocompleteOption('name')).toBeDisplayed();

await dispatchQueryEditorKey({ key: 'j', code: 'KeyJ', ctrl: true });
```

To wait on editor state, poll the bridge with `browser.waitUntil`:

```js
const editor = await s.query.editorContainer();
await browser.waitUntil(
  async () =>
    await browser.execute(
      (el, name) => el.__dgridTest?.getFieldNames().includes(name),
      editor,
      'name'
    ),
  { timeout: 10_000, timeoutMsg: 'Autocomplete field name was not ready' }
);
```

### Shortcuts and context menus

These helpers dispatch DOM events rather than sending native input:

- `dispatchShortcut({ key, code, meta, ctrl, shift, alt })` — a window-level `keydown` for
  app shortcuts (see `smoke.e2e.mjs`)
- `openContextMenuOnElement(element)` — dispatch `contextmenu` (via `contextClick`) and wait
  for the menu (see `sidebar-context-menu.e2e.mjs`)
- `openContextMenuFromFocusedCell(element)` — open the grid menu with Shift+F10

### Other helpers

`openQueryHistory()`, `switchResultsView(name)`, `editConnectionName(current, next)`,
`deleteConnectionFromDialog()` and `waitForAppReady()` are also exported from `helpers.mjs`.
Check it before writing a new helper.

## Before Writing a New E2E Test

1. **Check for subsumption** — Is this behavior already exercised by a more
   comprehensive test? If `query-execution.e2e.mjs` already navigates to a
   collection and runs a query, you don't need a separate test for "click
   collection opens query tab."

2. **Check the right test level** — E2E tests are for user journeys that span
   frontend and backend. Form field toggling, CSS state changes, and widget
   interactions belong in component tests (@testing-library/svelte).

3. **Extend before creating** — Before creating a new spec file, check if an
   existing spec already covers the feature area. Add tests to the existing
   file. Only create a new spec for a genuinely distinct feature area.

4. **One test for generic interactions** — Behaviors like "menu closes on
   Escape" or "dialog closes on overlay click" only need to be tested once
   across the entire suite, not in every spec that uses a menu or dialog.

## Coverage Expectations

E2E tests cover **user journeys** — flows that cross frontend and backend.

When implementing a new feature:

1. **Add selectors first** — any new UI element gets a selector in `tests/webdriver/selectors.mjs`
2. **Add or extend a spec** — one spec file per feature area in `tests/webdriver/specs/`
3. **Test the happy path at minimum** — user can perform the action and see the expected result
4. **Test error states only when they involve backend interaction** — pure frontend validation belongs in component tests

Existing spec files and what they cover:

- `advanced-query-execution.e2e.mjs` — shell-helper filters, chained `explain()` output
- `collection-tooltip.e2e.mjs` — collection stats tooltip on hover
- `connection-crud.e2e.mjs` — edit and delete saved connections
- `connections.e2e.mjs` — create via form and URI, test connection, connect
- `context-menu.e2e.mjs` — grid cell context menu, edit dialog, document delete and cancel
- `disconnect-tabs.e2e.mjs` — disconnect closes only that connection's tabs
- `edit-preview.e2e.mjs` — edit dialog update-query preview, copy, `_id` warnings
- `export.e2e.mjs` — export button visibility, export overlay
- `field-autocomplete.e2e.mjs` — editor field-name completions, popup navigation
- `field-editing.e2e.mjs` — edit values, change types, cancel
- `multi-query.e2e.mjs` — Run All sub-result tabs, execute modes, current-query execution
- `query-execution.e2e.mjs` — find queries, error display, pagination, status bar
- `query-formatting.e2e.mjs` — format button, format-assist suggestions
- `query-history.e2e.mjs` — history entries, restore into editor, clear
- `results-views.e2e.mjs` — Table/JSON/Tree view switching
- `sidebar-context-menu.e2e.mjs` — sidebar right-click menus for connections, databases, collections
- `sidebar-navigation.e2e.mjs` — expand databases, disconnect, refresh
- `smoke.e2e.mjs` — app shell loads, settings modal, shortcut rebinding, no update badge
- `tab-management.e2e.mjs` — open/close tabs, independent query text per tab
- `tab-shortcuts.e2e.mjs` — new tab / close tab keyboard shortcuts

When adding a feature that fits an existing area, extend the existing spec. Only create a new
spec file for a genuinely distinct feature area.

## Anti-Patterns

- **Don't use `browser.pause()`** — wait on state with `waitForDisplayed` (use
  `{ reverse: true }` to wait for something to disappear), `browser.waitUntil` with a
  `timeoutMsg`, or auto-waiting `expect(...)` matchers such as `toBeDisplayed` / `toHaveText`
- **Don't inline selectors** — add them to `tests/webdriver/selectors.mjs` and use `s`
- **Don't type query text with `browser.keys`** — set it with `clearAndTypeQuery` and the
  other editor-bridge helpers; keep `browser.keys` for single key presses such as `Escape`
  or `Backspace`
- **Don't use retries to mask flakiness** — no mocha `retries` or wdio `specFileRetries`;
  fix the root cause
- **Don't share state between tests** — reset with `resetApp()` and give each spec its own
  database; don't rely on test order
- **Don't duplicate coverage** — if a behavior is already tested by a more comprehensive test, don't add a simpler test for the same thing
- **Don't test widget behavior in E2E** — form field enable/disable, checkbox syncing, and input masking are component-level concerns
- **Don't test the same generic interaction in multiple specs** — "Escape closes menu" needs one test, not one per spec that has a menu
- **Don't create trivial spec files** — a spec with only 1-2 tests that verify simple visibility should be merged into a related spec

## Debugging

The runner writes everything to `tests/webdriver/artifacts/` (gitignored, wiped at the start
of each run):

- `failure-artifacts/<timestamp>-<suite>-<test>/` — for each failed test or hook, the
  `afterTest` / `afterHook` hooks in `wdio.conf.mjs` save `screenshot.png`,
  `page-source.html` and `failure.json` (error and stack)
- `harness.log`, `tauri-webdriver.log`, `tauri-app.log` — runner, driver and app output
- `wdio-junit-*.xml`, `ci-summary.md`, `runtime-metadata.json` — per-spec results, a
  summary with spec durations, and the run's environment

Run a single spec with `--spec` while iterating. `waitForAppReady()` includes a page-source
excerpt in its error when the app shell never renders.

## Running Tests

```bash
pnpm e2e:install-driver   # One-time: cargo install tauri-webdriver
pnpm e2e                  # Build debug app, start MongoDB + driver, run all specs
pnpm e2e:ci               # Same with --ci (longer timeouts; CI runs it on Linux under xvfb-run)
pnpm e2e:smoke            # Run only the smoke spec
node scripts/run-tauri-e2e.mjs --spec tests/webdriver/specs/smoke.e2e.mjs   # One spec
```
