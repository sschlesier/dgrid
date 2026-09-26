---
id: dgr-3fcq
status: open
deps: [dgr-ee3k]
links: []
created: 2026-09-26T23:13:36Z
type: feature
priority: 3
assignee: Scott Schlesier
tags: [stage:captured]
---

# Copy grid column across all results (all pages)

Users can copy one column's values for the entire query result, not just the loaded page, via 'Copy Column (all)' in the column header menu (dgr-mdl5), next to dgr-ee3k's 'Copy Column (this page)'. Its ⌥ alternate is 'Copy Column with Header (all)' (dgr-ixns), so there's no separate header item. Needs a backend command: likely extend export_csv_to_string (src-tauri/src/commands/export.rs) with an optional column filter, reusing its 2 MB cap and truncation notice (as the toolbar Copy-to-clipboard export does). Open questions for refinement: text/html format too, or CSV only; behaviour in drilldown (nested/array-expanded columns don't map directly to export's flattened dot-notation columns; maybe disable there); value formatting differs between Rust csv.rs and the frontend formatters (e.g. null, nested objects are flattened); loading state for large results.
