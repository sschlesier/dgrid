---
title: Bound query history storage
type: bug
priority: 3
approved: 'Scott Schlesier, 2026-09-30: largest-first trimming to a 1.5M-char budget, newest protected, panel matches saved copy. Cold read: not run (one area, no flags)'
status: in-review
---

Query history keeps persisting, and other localStorage writes keep working, however large
the queries in it are.

Context: history holds up to 200 entries (raised from 20 in `filter-query-history`) and is
saved whole to localStorage (`dgrid-query-history`) by `saveHistory` in
`src/stores/query.svelte.ts`, which swallows every `setItem` error. WebKit allows about
5 MB per origin, shared with settings, keybindings and column widths. About 200 distinct
large queries (for example `insertMany` with ~25 KB pasted payloads) exceed it: new history
silently stops persisting, so recent queries are gone after a restart, and other
localStorage writes in the app can start failing too. Found in the review of PR #41.

Steps to reproduce:

1. Run ~200 distinct queries of ~25 KB each (or seed `dgrid-query-history` with them).
2. Run one more query, then restart the app.
3. Expected: the latest query is in history. Actual: it is missing; history is whatever
   last fit.

Out of scope:

- Surfacing failed writes from the other localStorage stores (keybindings, settings,
  column widths, UI state, export mode, editor, JSON format). Their values are small.
- Changing the 200-entry cap, the dedupe rule, or the history UI.
- Moving history out of localStorage (e.g. to a file via the backend).

## Acceptance criteria

- [ ] The saved `dgrid-query-history` value is never longer than 1,500,000 characters.
- [ ] When the history (newest 200 entries) serializes larger than the budget, the
      largest entries are dropped first, one at a time, until it fits; among entries of
      equal size the older one goes first. The newest entry is never dropped this way.
      Every smaller entry is kept, whatever its age, and the remaining entries keep their
      newest-first order.
- [ ] A single entry whose own serialized form exceeds the budget is never saved, even
      the newest, and every other entry that fits still is.
- [ ] The history shown in the panel always matches what was saved: after each add, the
      in-memory list is the saved list, so entries dropped by the budget are not shown
      during the session either.
- [ ] When `setItem` throws (e.g. `QuotaExceededError`), the save retries with the budget
      halved to half the size it just tried, dropping largest entries first by the same
      rule (newest kept until it is the only entry left), until it succeeds or the list
      is empty; the in-memory list becomes the list
      that was saved. It never throws to the caller and shows nothing to the user.
- [ ] After a quota failure caused by the history, a write by another store (e.g.
      `dgrid-grid-column-widths`) succeeds, because history no longer fills the origin
      quota.
- [ ] A stored history over the budget (saved by an earlier release) loads trimmed to the
      budget by the same rule.
- [ ] `clearHistory` still saves an empty list, and stored histories within the budget
      load unchanged (no format change).

## Verification

- `pnpm verify`
- `pnpm test src/__tests__/query-store.test.ts` — new cases: a mix of many small and a few
  large entries over budget drops the largest (not the oldest) and stays ≤ 1,500,000
  chars, with order preserved; equal-size ties drop the older; a newest entry that is
  the largest but fits the budget is kept while older large ones go; an oversized newest
  entry is dropped while all others persist; in-memory `history` equals the saved list after
  each add; a mocked `setItem` that throws for values over a threshold leads to a
  successful smaller save, a matching in-memory list and no thrown error; a localStorage
  mock with a shared total quota shows a column-widths write succeeding after a history
  save that first hit the quota; an over-budget stored value loads trimmed.
- Manual, under `pnpm dev`: run 20 short queries, then 70 queries each with a ~25 KB
  literal (or paste a generated one). `localStorage.getItem('dgrid-query-history').length`
  stays ≤ 1,500,000; all 20 short queries are still in the history panel; the panel shows
  the same entries before and after restarting the app.

## Design

- **Budget:** 1,500,000 characters of serialized JSON (`JSON.stringify(...).length`,
  UTF-16 code units). The tightest Tauri webview is WebKit (macOS, Linux): 5 MiB per
  origin across all keys, counted as key + value bytes, 1 byte per character for strings
  that are all Latin-1 and 2 bytes for any string holding a character outside it
  (`localStorageQuotaInBytes`, `String::sizeInBytes`). A single non-Latin-1 character
  (emoji, CJK) in any query makes the whole history value cost 2 bytes per character, so
  the floor is 2,621,440 characters. The budget is ≤ 3 MB there, leaving ≥ 2.1 MiB for
  the other stores. Chromium/WebView2 (Windows) allows 10 MiB per storage area.
- **Which entries:** the 200-entry cap applies first (newest 200). If that list
  serializes over budget, drop the largest entry by serialized size (ties: the older),
  repeat until it fits. The newest entry is exempt, so the query just run is always in
  history, unless it alone exceeds the budget. 200 entries in 1.5M characters is ~7.5K each on average; most
  queries are far shorter, and very large ones (over ~8K) are usually kept in files too,
  so they are the cheapest to lose. Age is not a factor beyond the 200 cap.
- **Memory vs. disk:** both are trimmed. The in-memory list is set to what was saved, so
  the panel shows what survives a restart. An older query dropped for size, or a newest
  query over the whole budget, is not shown in history; it stays in its editor tab. The same selection is applied on load.
- **Quota errors:** retry with the budget set to half the serialized size just tried,
  using the same largest-first rule with the newest exempt, down to the newest alone,
  then empty. No notification: history is a
  convenience, and the budget makes this path rare.
- **No per-entry truncation:** a truncated query restored into the editor would be wrong
  and runnable, so entries are kept whole or not saved.
- **Stored format:** unchanged (array of `QueryHistoryItem`); older releases read it as
  before. No flags apply.

## Steps

1. In `src/stores/query.svelte.ts`, add `HISTORY_STORAGE_BUDGET = 1_500_000` and a pure
   `selectEntriesForStorage(history, budget)` that applies the largest-first rule with
   the newest entry exempt and preserves order. Export it for tests.
2. Change `saveHistory` to save that selection, retry with a halved budget on a `setItem`
   error until success or empty, and return the list it saved. `addToHistory` sets
   `this.history` to that list; `loadHistory` applies the selection to what it reads.
3. Add the Vitest cases above to `src/__tests__/query-store.test.ts`.

## Log

- 2026-09-30: Drafted from the PR #41 review (Filter query history): Scott Schlesier chose a separate spec over fixing it in that PR.
- 2026-09-30: Review answers: budget 1,500,000 chars; trim the in-memory history to match the saved copy; retry silently on quota errors; no cold read.
- 2026-09-30: Changed trimming from oldest-first to largest-first: most queries are short, and ones over ~8K are usually saved in files too (Scott Schlesier).
- 2026-09-30: The newest entry is exempt from largest-first trimming unless it alone exceeds the budget (Scott Schlesier).
- 2026-09-30: Approved: Scott Schlesier, 2026-09-30: largest-first trimming to a 1.5M-char budget, newest protected, panel matches saved copy. Cold read: not run (one area, no flags)
- 2026-09-30: Started on branch fix/bound-query-history-storage
- 2026-09-30: Assumption: when the newest entry alone exceeds the budget it is dropped and the next newest becomes the protected entry.
- 2026-09-30: Assumption: loading applies only the size budget, not the 200-entry cap; the cap still applies on the next add.
- 2026-09-30: Assumption: the cross-store criterion is tested with a localStorage stub that enforces a shared character quota (happy-dom has no quota), writing the column-widths key directly rather than through the grid store.
- 2026-09-30: Review started
