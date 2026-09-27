---
id: dgr-twf0
status: open
deps: []
links: [dgr-ye2b]
created: 2026-09-26T17:52:46Z
type: feature
priority: 3
assignee: Scott Schlesier
tags: [stage:agent-ready]
---

# Filter query history

Users can type in the Query History dropdown to narrow the list to queries whose text or
database name contains what they typed.

Context: the History dropdown (query toolbar → History) lists recent queries,
newest first, across all connections. It has no search, so finding an older query means
scanning the list. History holds at most 20 items today, which is too few for a filter to
be worth much, so this ticket also raises the cap.

Out of scope:

- Keyboard navigation of the list (arrow keys, Enter to pick): dgr-ye2b
- Filtering by connection, date or run time; a "this connection only" toggle
- The `/` shortcut (dgr-650q) reaching this input

## Design

- A text input at the top of the dropdown, below the header, with the placeholder
  "Filter history...". It's focused when the dropdown opens.
- Matching: case-insensitive substring match against the full query text (not just the
  collapsed preview) and the database name. Leading and trailing whitespace is ignored.
  Filtering happens as you type, with no debounce.
- The list keeps its newest-first order; matching text isn't highlighted.
- Filter text isn't saved: it's empty each time the dropdown opens.
- Escape: if the filter has text, clear it (the dropdown stays open); if it's empty, close
  the dropdown. This matches the sidebar collection filter.
- A clear (×) button appears in the input when it has text.
- Empty states: no history at all → the existing "No queries in history" message, and the
  filter input is hidden. History exists but nothing matches → "No matching queries".
- "Clear All" still clears all history, not just the filtered items.
- History stays global across connections; rows are unchanged.
- **Config change:** raise `MAX_HISTORY_ITEMS` from 20 to 200. Existing stored history
  (localStorage `dgrid-query-history`) is kept as-is; no migration.
- Frontend only; no Rust changes.

## Acceptance Criteria

- [ ] Opening History focuses a filter input at the top of the dropdown.
- [ ] Typing narrows the list to items whose query text or database contains the input,
      ignoring case, including text that appears only after the preview is truncated.
- [ ] With the filter empty, the full list is shown in the same order as today.
- [ ] Nothing matches → "No matching queries" is shown; no history at all → "No queries in
      history" and no filter input.
- [ ] Escape with text clears the filter and keeps the dropdown open; Escape when empty
      closes it.
- [ ] Clicking a filtered item loads that query into the editor, as today.
- [ ] Reopening the dropdown shows an empty filter.
- [ ] "Clear All" empties the whole history even while a filter is active.
- [ ] History keeps up to 200 entries; the 201st distinct query drops the oldest.
- [ ] History saved before this change still loads.

## Verification

- `pnpm verify`
- `pnpm test src/__tests__/components/QueryHistory.test.ts` (new file): cases for focus
  on open, matching by query text and by database, case-insensitivity, both empty states,
  Escape clear-then-close, selecting a filtered item calls `onselect` with it
- `pnpm test src/__tests__/query-store.test.ts`: the history cap is 200 (adding 201
  distinct items keeps the newest 200)
- Manual (`pnpm dev`): run a few queries against two databases → open History → the filter
  is focused → type part of a collection name → the list narrows → type a database name
  → only that database's queries remain → Escape → the filter clears and the list is full
  → Escape → the dropdown closes.

## Notes

**2026-09-26T17:59:01Z**

Refined: filter matches query text + database, Escape clear-then-close, history cap raised 20→200 (no migration), stays global across connections; keyboard nav split to dgr-ye2b.

**2026-09-27T00:09:45Z**

Approved for agent pickup by Scott Schlesier. Preview cold read: pass.
