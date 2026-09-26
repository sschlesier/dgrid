---
id: dgr-j1m3
status: open
deps: [dgr-ixns]
links: []
created: 2026-09-26T23:17:29Z
type: feature
priority: 3
assignee: Scott Schlesier
tags: [stage:captured]
---

# Show shortcut and modifier hints in context menus

Context menu items show their keyboard shortcut and modifier alternates as right-aligned hint text (e.g. '⌥' on items whose ⌥ alternate adds headers, or the configured keybinding for Insert Document), so users can discover the ⌥ alternates added by dgr-ixns and the existing shortcuts. Source of shortcut labels: keybindingsStore (matchesBinding / getBinding). Open questions for refinement: hint text for alternates (just '⌥' or '⌥ with headers'), whether hints follow user-customised bindings, and which menus get hints (grid only, or all ContextMenu users).
