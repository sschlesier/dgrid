---
id: dgr-mdl5
status: open
deps: []
links: []
created: 2026-09-26T23:13:36Z
type: feature
priority: 3
assignee: Scott Schlesier
tags: [stage:captured]
---

# Right-click menu on grid column headers

Users can right-click a column header in the results grid to get column actions. Today GridHeader.svelte only handles sort-on-click and resize; there's no context menu. This ticket builds the header menu (using ContextMenu) with its own first actions. The column copy items come later from dgr-ee3k (this page) and dgr-3fcq (all), which depend on this ticket; column actions live only in the header menu, not the cell menu. Proposed first actions, to settle during refinement: Copy Field Path, Sort Ascending, Sort Descending. Other open questions: reset width, and behaviour in drilldown and array-expanded columns.
