---
id: dgr-ua7v
status: open
deps: [dgr-mlct]
links: []
created: 2026-09-26T23:06:20Z
type: feature
priority: 3
assignee: Scott Schlesier
tags: [stage:captured]
---

# Row selection in grid and copy selected rows

Users can select multiple rows in the results grid (click, Shift+click, Cmd+click, Cmd+A) and copy them all at once with Copy Rows / Copy Rows with Headers, reusing the CSV + HTML clipboard formatters from dgr-mlct. Inspiration: Studio 3T Table View 'Copy Selected Documents as CSV' on multi-row selections. Open questions for refinement: selection model and visuals, Cmd+C shortcut, interaction with pagination/drilldown, cap on row count.
