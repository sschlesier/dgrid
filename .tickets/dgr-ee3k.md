---
id: dgr-ee3k
status: open
deps: [dgr-mlct, dgr-mdl5]
links: []
created: 2026-09-26T23:10:13Z
type: feature
priority: 2
assignee: Scott Schlesier
tags: [stage:refined]
---

# Copy grid column to clipboard as CSV and spreadsheet table

In the results grid, users can right-click a column header and copy that column's values for the current page, so they paste one per line into editors and down a single column in spreadsheets.

Context: the grid context menu can copy a single value, a field path, a document and (with dgr-mlct) a row, but there's no way to grab all of one column's values, such as a list of `_id`s or emails. The grid loads one page at a time from the backend (50–500 rows), so this ticket copies the loaded page. It reuses dgr-mlct's CSV + HTML table clipboard formatters with a single column.

Out of scope:

- Copying the column across the whole result set, "(all)" (follow-up ticket; needs a backend command)
- Building the column header menu (dgr-mdl5) or ⌥ alternate support (dgr-ixns)
- Copy Column items in the cell/row context menu (column actions live only in the header menu)
- A JSON format (a JSON array of values)
- Copying several columns or a range of cells
- Copy Column in the JSON and Tree views
- Any Rust/backend change; this is frontend-only

## Design

- Depends on dgr-mdl5 (column header context menu) and dgr-mlct, which brings in dgr-ixns (⌥ alternate items). Use dgr-mlct's formatters (columns + rows[] + include-headers flag) with `columns = [the clicked column]`. Don't write a separate formatter.
- Menu item: one "Copy Column (this page)" item (values only) in the column header context menu. Its ⌥ alternate is "Copy Column with Header (this page)" (the column name first): holding ⌥ swaps the label, and ⌥-click runs it. The "(this page)" suffix is on purpose: it tells users the copy doesn't include every result, and it leaves room for the "(all)" follow-up.
- Rows copied: every row on the currently loaded page, in the order shown (so a client-side sort is respected).
- In drilldown view: the drilled-into rows' values for the right-clicked header's column. The header is the column name as displayed (the same as dgr-mlct).
- Formats and value formatting: the same as dgr-mlct. `text/plain` is CSV (one value per line, RFC 4180 quoting). `text/html` is a one-column `<table>` with the `mso-number-format` text hint on cells that aren't numbers or booleans. Null and missing values give empty lines/cells, and objects and arrays give compact one-line JSON.
- Fallback and errors: the same as dgr-mlct (fall back to `writeText(csv)`, and show an error notification if both writes fail). No notification on success.

## Acceptance Criteria

- [ ] Right-clicking a column header in the grid table view shows "Copy Column (this page)"; the cell/row context menu has no Copy Column item
- [ ] Holding ⌥ with the header menu open shows "Copy Column with Header (this page)" in its place
- [ ] Copy Column (this page), pasted into a plain-text editor, gives one line per row on the current page, in displayed order
- [ ] Copy Column with Header (this page), pasted as plain text, starts with the column name followed by the values
- [ ] Copy Column (this page), pasted into Numbers or Google Sheets, fills one column with one value per cell
- [ ] After sorting the grid by another column, Copy Column follows the sorted order
- [ ] Rows missing the field, or with null, give empty lines/cells so the other lines stay in step with the rows
- [ ] Values containing a comma, a quote or a newline are quoted and escaped in the CSV
- [ ] In drilldown view, Copy Column copies the drilled-into rows' values for that column

## Verification

- `pnpm verify`
- `pnpm test src/__tests__/grid-utils.test.ts`: cases for the dgr-mlct formatters with a single column and multiple rows (header on/off, missing/null values, escaping)
- Manual (`pnpm dev`): run `db.<coll>.find({})` on a collection with 60+ documents where some are missing a field and some values contain commas. With the page size at 50, right-click that column's header, then:
  1. Copy Column (this page), then paste into TextEdit (plain text): 50 lines, blank lines where the field is missing
  2. Hold ⌥ and click Copy Column with Header (this page), then paste into TextEdit: the column name, then 50 values
  3. Copy Column (this page), then paste into Numbers or Google Sheets: 50 cells in one column
  4. Sort by another column, then Copy Column (this page): the order follows the sort
  5. Drill into a nested field, then Copy Column (this page) on a drilled-in column's header: the drilled-in values are copied

## Notes

**2026-09-26T23:13:28Z**

Refined: current page only, labelled '(this page)'; right-click a cell only; with/without header items; reuses dgr-mlct formatters. (all) and header menus split to follow-ups.

**2026-09-26T23:17:54Z**

Revised: Copy Column moves from the cell menu to the column header menu (dgr-mdl5, now a dependency); 'with Header' is a ⌥ alternate (dgr-ixns) instead of a separate item.
