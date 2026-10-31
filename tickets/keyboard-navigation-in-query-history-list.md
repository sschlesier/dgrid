---
agent: 'STOP: run `spx help --skill` and follow it before any work on this spec. Use spx for every store step; never edit the store by hand.'
title: Keyboard navigation in query history list
id: zho-lay
type: feature
priority: 3
depends-on: []
parent:
approved: 'Scott Schlesier, 2026-10-10: approved after review. Cold read: not run'
status: done
---

The Query History dropdown can only be used with the mouse. Users should be able to move through the list with the arrow keys and press Enter to load the highlighted query, including while the filter input (`filter-query-history`) has focus.

Context: `src/components/QueryHistory.svelte` renders `.history-item` buttons and a `.history-filter` input that is focused on open. Its only key handling is a window `keydown` for Escape. `QueryPanel.svelte` passes `onselect` (`selectHistoryItem`: sets the tab's query text, closes the dropdown, refocuses the editor).

Out of scope:

- Home/End/PageUp/PageDown, type-ahead, or any new global shortcut to open the dropdown.
- Changing the filter, Escape, Clear All or hover-popup behavior.
- Changes to `QueryPanel.svelte` or the store.

## Acceptance criteria

- [x] With the dropdown open and the filter input focused, ArrowDown highlights the first item; each further ArrowDown moves the highlight to the next item, and ArrowUp moves it back.
- [x] The highlight stops at the first and last visible item (no wrap-around).
- [x] Enter while an item is highlighted calls `onselect` with that item, so the query loads into the editor and the dropdown closes. With no highlighted item, Enter does nothing.
- [x] The highlighted item is visually distinct and scrolled into view in the list.
- [x] Nothing is highlighted when the dropdown opens or when the filter text changes; the highlight only appears on ArrowDown/ArrowUp, and is cleared whenever the filter text changes.
- [x] Focus stays in the filter input while navigating, so typing continues to edit the filter.
- [x] ArrowUp/ArrowDown in the filter input do not move the text cursor.
- [x] Mouse behavior is unchanged: clicking an item selects it, and the hover popup still appears on hover.
- [x] Escape behavior is unchanged (clears the filter, then closes).
- [x] Tabbing to an item button and pressing Enter still selects it exactly once.

## Verification

- `pnpm test src/__tests__/components/QueryHistory.test.ts` — new component tests for each criterion above, alongside the existing filter tests.
- `pnpm verify`
- `node scripts/run-tauri-e2e.mjs --spec tests/webdriver/specs/query-history.e2e.mjs` — one new journey in the existing spec: run two queries, open History, ArrowDown, Enter, and see that query restored in the editor.
- Manual under `pnpm dev`: open History, press ArrowDown/ArrowUp, confirm the highlight moves and scrolls with a long list, press Enter and confirm the query loads and the dropdown closes.

## Design

Decisions (defaults, overrule if wrong):

- Keyboard highlight is a component-local index into `filteredHistory`, separate from mouse hover.
- DOM focus stays on the filter input; the highlighted item is exposed with `aria-activedescendant` on the input and `role="listbox"` / `role="option"` with `aria-selected` on the list and items. Items keep working as buttons for mouse and Tab use.
- Arrow/Enter handling goes on the filter input's `keydown`, with `preventDefault` for ArrowUp/ArrowDown. Enter is handled only when the event target is the filter input, so a focused item button keeps its native click and doesn't fire twice.
- Keyboard highlight does not show the hover popup.
- Add a `history.activeItem` selector to `tests/webdriver/selectors.mjs`; extend `query-history.e2e.mjs` rather than adding a spec.
- Frontend only. No flags (no data migration, public API or config change).

- Nothing is highlighted on open or after the filter changes, so Enter can't load a query until the user has navigated.

## Log

- 2026-09-27: Migrated from tk dgr-ye2b (created 2026-09-26T17:58:46Z).
- 2026-09-30: Imported from br as dgr-d3m.
- 2026-10-10: Refined: added acceptance criteria, verification, design defaults.
- 2026-10-10: Decided: no highlight on open or filter change.
- 2026-10-10: Approved: Scott Schlesier, 2026-10-10: approved after review. Cold read: not run
- 2026-10-31: Started on branch feat/history-keyboard-nav
- 2026-10-31: Implemented in 84fe397; E2E not run: tauri build fails on plugin-opener version mismatch (npm 2.6.0 vs crate 2.7.1), unrelated to this change. Scroll-into-view not yet verified (jsdom).
- 2026-10-31: Manual pnpm dev check passed (Scott). Fixed E2E blocker by aligning @tauri-apps/plugin-opener to ~2.7.2; query-history E2E passes 5/5.
- 2026-10-31: Status: in-review
- 2026-10-31: Review round 1 dismissals: optionId collision (history ids are crypto.randomUUID); Enter preventDefault mutant (input is not in a form); E2E multi-line text (E2E queries are single-line).
- 2026-10-31: Review round 1 assumption: out-of-scope plugin-opener bump to ~2.7.2 (bd36f9b) to unblock tauri build for E2E.
- 2026-10-31: Review round 1 decisions (Scott): ArrowUp from no highlight stays a no-op; modifier+Enter behaves like Enter; highlight drift if history changes while open accepted (unlikely behind full-screen backdrop); separate keyboard/hover highlight confirmed.
- 2026-10-31: Status: done: Reviewed round 1: all criteria verified; 3 open decisions answered with no code change
