---
title: Filter query history
type: feature
priority: 3
approved: "Scott Schlesier, 2026-09-28: filter by query text and database, Escape clear-then-close, cap 20→200, happy-path e2e. Cold read: pass."
status: in-review
---

Users can type in the Query History dropdown to narrow the list to queries whose text or
database name contains what they typed.

Context: the History dropdown (query toolbar → History) lists recent queries,
newest first, across all connections. It has no search, so finding an older query means
scanning the list. History holds at most 20 items today, which is too few for a filter to
be worth much, so this ticket also raises the cap.

Out of scope:

- Keyboard navigation of the list (arrow keys, Enter to pick): `keyboard-navigation-in-query-history-list`
- Filtering by connection, date or run time; a "this connection only" toggle
- The `/` shortcut (`press-slash-to-focus-the-nearest-search`) reaching this input

## Acceptance criteria

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

## Verification

- `pnpm verify`
- `pnpm test src/__tests__/components/QueryHistory.test.ts` (new file): cases for focus
  on open, matching by query text and by database, case-insensitivity, both empty states,
  Escape clear-then-close, selecting a filtered item calls `onselect` with it
- `pnpm test src/__tests__/query-store.test.ts`: adjust the existing "addToHistory limits
  to 20 items" test to the new cap of 200 (adding 201 distinct items keeps the newest 200)
- `pnpm e2e --spec tests/webdriver/specs/query-history.e2e.mjs`: new happy-path test in the
  existing spec. Run two queries, open History, type a filter → the list narrows → click
  the remaining item → its query is restored in the editor. Add the selectors it needs
  (filter input, clear button, no-matches message) to the `history` group in
  `tests/webdriver/selectors.mjs`. If the runner stops with "tauri-webdriver is not
  installed", don't install it: still write the test, and record in a note that the live
  run was skipped. A build failure or a failing spec is not a skip.
- Manual (`pnpm dev`): run a few queries against two databases → open History → the filter
  is focused → type part of a collection name → the list narrows → type a database name
  → only that database's queries remain → Escape → the filter clears and the list is full
  → Escape → the dropdown closes.

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
- The filter input and the × button have aria-labels ("Filter history", "Clear filter").
- A filter that is only whitespace matches everything, so the full list shows. Escape
  clears any text in the input, whitespace included, before it closes the dropdown, as the
  sidebar filter does.

## Log

- 2026-09-26: Refined: filter matches query text + database, Escape clear-then-close, history cap raised 20→200 (no migration), stays global across connections; keyboard nav split to `keyboard-navigation-in-query-history-list`.
- 2026-09-27: Migrated from tk dgr-twf0 (created 2026-09-26T17:52:46Z).
- 2026-09-27: Approved for agent pickup by Scott Schlesier. Preview cold read: pass.
- 2026-09-27: Stage carried over from its stage label when stages became statuses.
- 2026-09-28: Approved by Scott Schlesier: filter by query text and database, Escape clear-then-close, cap 20→200, happy-path e2e. Cold read: pass.
- 2026-09-28: Started on branch feat/filter-query-history
- 2026-09-28: Done on branch feat/filter-query-history (3 commits):

  - MAX_HISTORY_ITEMS 20 → 200; store test updated (201 distinct items keep the newest 200).
  - QueryHistory.svelte: filter input ("Filter history...", aria-labelled, focused on open), × clear button, case-insensitive trimmed substring match on full query text and database, "No matching queries" state, filter hidden when history is empty. Escape handling lives in the existing window keydown handler: clears text first, closes when empty. Filter state is component-local, so it's empty on every open.
  - New src/__tests__/components/QueryHistory.test.ts (13 cases) covering the Verification list.
  - E2E: new happy-path test in query-history.e2e.mjs plus history.filterInput / filterClearButton / noMatches selectors.

  Verified: `pnpm verify` passes (702 TS tests, clippy, 183 Rust tests). `node scripts/run-tauri-e2e.mjs --spec tests/webdriver/specs/query-history.e2e.mjs` passes, 4/4. The e2e runner has to run outside the agent sandbox (the driver can't bind :4444 inside it); one run also failed because a driver from the previous run was still holding the port.

  Not done: the manual `pnpm dev` walkthrough.
- 2026-09-30: Imported from br as dgr-43r. Related: `keyboard-navigation-in-query-history-list`.
- 2026-09-30: Imported into the spec store; PR #41 open for review.
