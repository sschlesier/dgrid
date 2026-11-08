---
agent: "STOP: run `spx help --skill` and follow it before any work on this spec. Use spx for every store step; never edit the store by hand."
title: Row selection in grid and copy selected rows
id: lib-lin
type: feature
priority: 3
depends-on: [copy-grid-row-to-clipboard-as-csv-and-spreadsheet-table]
approved: "Scott Schlesier, 2026-11-08: Row selection via gutter, Cmd/Ctrl+C and Copy Rows menu; current page only; refined with cold read. Cold read: pass (no blocking; 3 spec issues folded in)"
status: in-review
---

Users can select one or more rows on the current page of the results grid (gutter click, Shift+click, Cmd/Ctrl+click, Cmd/Ctrl+A) and copy them together as CSV plus a spreadsheet table, via Cmd/Ctrl+C or the right-click Copy submenu.

Inspiration: Studio 3T Table View "Copy Selected Documents as CSV". Reuses `copyRowsToClipboard` in `src/components/grid/utils.ts` (done in the dependency spec); the work is selection state, its UI and the copy entry points.

## Acceptance criteria

- [x] Each grid row has a narrow gutter cell showing its 1-based row number. Clicking a gutter cell selects only that row (replacing any selection); selected rows show a distinct highlight and `aria-selected="true"`.
- [x] Cmd+click (Ctrl+click on Windows/Linux) on a gutter cell toggles that row in the selection; Shift+click selects the contiguous range from the last clicked row (the anchor) to the clicked row, replacing the selection.
- [x] Cmd/Ctrl+click or Shift+click on any data cell does the same as on the gutter and does not drill. A plain click on a data cell still drills into object/array cells and does not change the selection.
- [x] With focus inside the grid, Cmd/Ctrl+A selects every row on the current page (and prevents the browser's select-all); Escape clears the selection.
- [x] The selection is cleared when the page, page size, sort, drilldown path or result set changes (including re-run and reload after edit or delete).
- [x] With one or more rows selected and no text selected in the page, Cmd/Ctrl+C copies the selected rows in display (top-to-bottom) order as text/plain CSV and text/html table, identical in format to Copy Row (no headers). Without a selection, Cmd/Ctrl+C behaves as before.
- [x] Right-clicking a selected row opens the Copy submenu with "Copy Rows" (copies the whole selection); holding ⌥ switches it to "Copy Rows with Headers". Right-clicking an unselected row first replaces the selection with that row, and the menu keeps the single-row "Copy Row" wording. Copying one selected row uses "Copy Row".
- [x] Copying shows no notification on success and an error notification when `copyRowsToClipboard` returns false: "Failed to copy rows to clipboard" for a multi-row selection, and the existing "Failed to copy row to clipboard" for a single row.
- [x] Columns in the copied output are the visible grid columns at the current drilldown level, same as Copy Row.

## Verification

- `pnpm verify`
- `pnpm test grid-selection` (new Vitest file for the selection logic: click, range, toggle, select all, clear on page/sort/drill change) and `pnpm test grid-utils` (unchanged copy formatters still pass).
- Component test with @testing-library/svelte for `ResultsGrid`/`GridRow`: gutter click, Cmd+click, Shift+click, plain click on a drillable cell drills without selecting, Cmd+C writes the selected rows to a mocked clipboard, Cmd+C with no selection does not call the mocked clipboard.
- E2E: extend `tests/webdriver/specs/context-menu.e2e.mjs` (seed 3+ documents; gutter-click one row, Shift+click another, right-click, "Copy Rows"; assert the grid shows the highlighted rows and the menu label). Add selectors for the gutter cell and selected row in `tests/webdriver/selectors.mjs`. Run: `node scripts/run-tauri-e2e.mjs --spec tests/webdriver/specs/context-menu.e2e.mjs`.
- Screenshot (for review) under `pnpm dev`, light and dark theme: a selected row is visibly distinct from hover and from even-row striping. Unit tests assert only the `.selected` class and `aria-selected`.
- Manual under `pnpm dev`: select three rows, Cmd+C, paste into a spreadsheet and a text editor; expect three rows in order, as separate cells and as CSV. Paste after ⌥ "Copy Rows with Headers"; expect a header line first.

## Design

- Selection model: per-tab, in `gridStore` (`src/stores/grid.svelte.ts`), as a set of indexes into the displayed (sorted, drilled) rows plus an anchor index. Indexes, not document ids, because array-flattened drilldown rows share a document and sorting reorders rows. This is why selection clears on sort, drill, page and result changes.
- Scope: current page only. No row cap is needed: the maximum is the page size (≤ 500). Cross-page copy is out of scope (see "Copy grid column across all results (all pages)" for the all-pages precedent).
- Click model: the new gutter column carries plain/Cmd/Shift selection. Data cells keep drill-on-click; only modified clicks select. Gutter clicks never drill or edit.
- Keyboard: Cmd/Ctrl+C, Cmd/Ctrl+A and Escape are handled in `ResultsGrid.svelte` when focus is inside the grid and no dialog is open (same guard as the existing `handleKeyDown`). They are fixed native-style keys, not entries in `SHORTCUT_DEFINITIONS`. Cmd/Ctrl+C defers to the browser when `window.getSelection()` is non-empty text or focus is in an input, so normal text copy is unaffected.
- Focus: the grid container is focusable (`tabindex="-1"`) and takes focus on a gutter or modified click; "focus inside the grid" means `container.contains(document.activeElement)`. The Cmd/Ctrl+C deferral to text selection is unit tested with a mocked `window.getSelection`.
- Gutter: fixed width (about 40px), shows the row number within the current page, and is not part of the copied columns.
- Copy: call `copyRowsToClipboard(columns, selectedRows, includeHeaders)` with rows in ascending index order; no new formatter.
- Context menu: right-click on a selected row keeps the selection and copies all of it; on an unselected row it replaces the selection first. Single-row selection reuses the "Copy Row" label and ⌥ alternate from the dependency spec.
- Visuals: highlight uses an existing theme color token (e.g. the selection/accent background), also in dark theme; hover and even-row striping must remain distinguishable from selected.
- Flags: none (no stored data, no API, no config).

## Boundaries

- Don't touch: Rust backend, `export_csv_to_string`, and the existing single-row Copy Row output format.
- Stop and ask if: making selection work requires changing drill-on-click behavior for plain clicks, or adding a keybinding to `SHORTCUT_DEFINITIONS`.

## Log

- 2026-09-27: Migrated from tk dgr-ua7v (created 2026-09-26T23:06:20Z).
- 2026-09-30: Imported from br as dgr-3b6.
- 2026-11-08: Approved: Scott Schlesier, 2026-11-08: Row selection via gutter, Cmd/Ctrl+C and Copy Rows menu; current page only; refined with cold read. Cold read: pass (no blocking; 3 spec issues folded in)
- 2026-11-08: Started on branch feat/grid-row-selection
- 2026-11-08: Status: in-review: implementation done; verify passes; E2E passes; screenshots and manual paste check outstanding
