---
agent: "STOP: run `spx help --skill` and follow it before any work on this spec. Use spx for every store step; never edit the store by hand."
title: Copy grid row to clipboard as CSV and spreadsheet table
id: pol-tow
type: feature
priority: 2
depends-on: [context-menu-submenus-and-alternate-items]
approved: "Scott Schlesier, 2026-10-10: approved after refinement. Cold read: blocked only on the then-unrefined dependency, since approved"
status: in-review
---

In the results grid, users can right-click a row and copy the whole row to the clipboard, so it pastes as comma-separated text into editors and as separate cells into spreadsheets.

Context: the grid context menu has Copy Value, Copy Field Path, Copy Document as JSON and Copy \_id, but nothing copies a row's values in column order. The toolbar CSV export (`export_csv_to_string`) covers whole result sets, not one row. Studio 3T's Table View offers "Copy Selected Documents as CSV / for Excel", each with and without headers; this ticket gets both formats from one copy by writing multiple clipboard formats.

Out of scope:

- Selecting and copying multiple rows (the grid has no row selection; that's a follow-up ticket)
- A keyboard shortcut for copying a row
- Building the Copy submenu or ⌥ alternate support (`context-menu-submenus-and-alternate-items` provides both)
- Showing a ⌥ hint in the menu (`show-shortcut-and-modifier-hints-in-context-menus`)
- Lossless copy/paste of documents between collections
- Copy Row in the JSON and Tree views
- Any Rust/backend change; this is frontend-only

## Acceptance criteria

- [ ] Right-clicking any row in the grid table view shows "Copy Row" in the Copy submenu, directly after "Copy Document as JSON"
- [ ] Holding ⌥ with the menu open shows "Copy Row with Headers" in its place; releasing ⌥ shows "Copy Row" again
- [ ] After Copy Row, pasting into a plain-text editor gives one CSV line with the row's values in grid column order
- [x] After Copy Row with Headers, the pasted plain text is a header line of column names in grid column order followed by the values line; Copy Row produces no header
- [ ] After Copy Row, pasting into Numbers or Google Sheets puts each column's value in its own cell
- [x] A value containing a comma, a double quote or a newline is quoted and escaped in the CSV
- [x] In the HTML format, ObjectId, Long, Decimal128, Date and string cells have the `mso-number-format` text hint; number and boolean cells don't
- [x] Null and missing fields come out as empty cells; nested objects and arrays come out as one-line JSON
- [ ] In drilldown view, Copy Row copies the drilled-into row's displayed columns
- [x] If writing the multi-format clipboard fails, CSV is still copied as plain text

## Verification

- `pnpm verify`
- `pnpm test src/__tests__/grid-utils.test.ts`: new cases for the rows → CSV and rows → HTML formatters (escaping, null/missing, BSON types incl. Binary, nested values, header on/off, the `mso-number-format` hint, multiple rows) and for the clipboard helper with `navigator.clipboard` mocked (multi-format write, `writeText` fallback, error notification when both fail)
- Manual (`pnpm dev`): run `db.<coll>.find({})` on a collection whose documents have an ObjectId, a Date, a string containing a comma and a quote, a null and a nested object. Right-click a row and open Copy ▸, then:
  1. Copy Row, then paste into TextEdit in plain-text mode: one correctly quoted CSV line
  2. Hold ⌥ and click Copy Row with Headers, then paste into TextEdit: a header line followed by the values line
  3. Copy Row, then paste into Numbers or Google Sheets: one value per cell
  4. Paste into Excel, if available: the ObjectId stays a hex string
  5. Drill into the nested object, right-click a row and choose Copy Row: the drilled-in columns are copied

## Design

- Depends on `context-menu-submenus-and-alternate-items` (Copy submenu and ⌥ alternate items in `ContextMenu`).
- Menu item: one "Copy Row" item (values only) in the grid's "Copy ▸" submenu, directly after "Copy Document as JSON". Its ⌥ alternate is "Copy Row with Headers" (a header line of column names first): holding ⌥ swaps the label, and ⌥-click runs it. It appears when right-clicking anywhere on a row (a cell doesn't have to be targeted).
- What's copied: the grid's current columns (`gridState.columns`) in display order and the right-clicked row as displayed. In drilldown view, that's the drilled-into row and its columns.
- Clipboard: one `navigator.clipboard.write([new ClipboardItem({...})])` with two formats:
  - `text/plain`: CSV. Fields that contain a comma, a double quote, CR or LF are wrapped in double quotes, with embedded quotes doubled (RFC 4180). Lines are separated by `\n`.
  - `text/html`: a `<table>` with one `<tr>` per line, `<th>` cells for the header and `<td>` cells for values. Values are HTML-escaped. No styling except the number-format hint below.
- Formatting cell values (the same for both formats):
  - ObjectId → hex, Date → ISO 8601, UUID → canonical string, Long and Decimal128 → their string value, Binary → its `_value` string (base64) (all as `formatCellCopyValue` does)
  - null and missing field → empty cell (as CSV export does)
  - objects and arrays → compact one-line Extended JSON
  - strings, numbers and booleans → as they are
- Excel text format: in the HTML table, every `<td>` except numbers (JS `number`; the grid can't tell Int32 from Double) and booleans gets `style="mso-number-format:'\@'"`, so Excel keeps ObjectIds, Longs, Decimal128 values, dates and numeric-looking strings as text.
- Fallback: if `ClipboardItem` is unavailable or `write()` rejects, call `navigator.clipboard.writeText(csv)`. If that also fails, show an error notification (`appStore.notify('error', ...)`).
- "Missing field" means the key is absent from the row; only the grid's displayed columns are read, so internal keys (`_docId`, `_docIndex`, `_arrayIndex`) never appear.
- Success: no notification, matching the existing Copy items.
- The formatters are pure functions in `src/components/grid/utils.ts` that take `columns` and a list of `rows` (not a single row) plus an include-headers flag, so multi-row copy can reuse them.

## Log

- 2026-09-26: Refined: formats settled as CSV text/plain + HTML table text/html (one copy); two menu items (with/without headers, per Studio 3T); displayed columns incl. drilldown; mso-number-format text hint for Excel; writeText fallback; formatters take rows[] for multi-row follow-up.
- 2026-09-26: Revised: Copy Row moves into the Copy ▸ submenu (`context-menu-submenus-and-alternate-items`); 'with Headers' is now a ⌥ alternate, not a separate item. Depends on `context-menu-submenus-and-alternate-items`.
- 2026-09-27: Migrated from tk dgr-mlct (created 2026-09-26T23:02:07Z).
- 2026-09-30: Imported from br as dgr-829.
- 2026-10-10: Cold read: blocked only on the unmet dependency `context-menu-submenus-and-alternate-items` (unrefined draft); kept as a dependency by decision. Added Binary formatting, missing-field and number-type clarifications, and clipboard-helper tests.
- 2026-10-10: Scott Schlesier, 2026-10-10: approved after refinement. Cold read: blocked only on the then-unrefined dependency, since approved
- 2026-10-31: Started on branch feat/copy-grid-row
- 2026-10-31: Implemented on feat/copy-grid-row (76f14c4); criteria 1-3, 5, 9 need manual check under pnpm dev. Header labels use column label.
- 2026-10-31: Status: in-progress
- 2026-10-31: Status: in-review
- 2026-10-31: Review round 1: dismissed 2 equivalent mutants (header cell plain flag; typeof ClipboardItem guard, both behave identically). Added tests for lone quote, bare CR and html header flag.
- 2026-10-31: Review round 1 answers: Scott will do manual steps 1-3 and 5 under pnpm dev (menu, paste into Numbers/Sheets, drilldown); Excel risk accepted; menu wiring left as manual check (no component test).
