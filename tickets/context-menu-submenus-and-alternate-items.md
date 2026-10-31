---
agent: "STOP: run `spx help --skill` and follow it before any work on this spec. Use spx for every store step; never edit the store by hand."
title: Context menu submenus and ⌥ alternate items; group grid copy items under Copy
id: yew-zho
type: feature
priority: 2
approved: "Scott Schlesier, 2026-10-10: approved after refinement. Cold read: pass"
status: in-review
---

In the results grid's cell/row context menu, the copy actions sit under a single "Copy ▸" submenu, and any context menu item can declare a ⌥ (Option) alternate, so the upcoming copy features don't flood the menu.

Context: `ContextMenu.svelte` is a flat list of `{label, onclick, destructive, separator}` with Escape-to-close and viewport flipping, and no keyboard navigation. It is used by `ResultsGrid`, `Sidebar`, `TreeNode` and `TreeView`. The upcoming `copy-grid-row-to-clipboard-as-csv-and-spreadsheet-table`, `copy-grid-column-to-clipboard-as-csv-and-spreadsheet-table` and `copy-grid-column-across-all-results-all-pages` depend on this spec, and `show-shortcut-and-modifier-hints-in-context-menus` builds on it.

Out of scope:

- Arrow-key navigation inside menus (none exists today)
- The ⌥ hint text and shortcut hints (`show-shortcut-and-modifier-hints-in-context-menus`)
- Any new copy item (Copy Row, Copy Column); this spec only moves the existing five
- Changes to the Sidebar, TreeNode or TreeView menus

## Acceptance criteria

- [x] A menu item can declare `submenu: MenuItem[]`; hovering it opens the submenu beside it, and the parent shows a ▸ marker
- [x] A submenu that would overflow the viewport on the right opens to the left of its parent, and one that would overflow the bottom is shifted up so it fits
- [x] Clicking a submenu item runs it and closes the whole menu; Escape closes the whole menu
- [x] A menu item can declare `altLabel` and `altOnclick`; while ⌥ is held with the menu open the label shows `altLabel`, and releasing ⌥ restores `label`
- [x] Clicking an item with ⌥ held runs `altOnclick`; clicking without ⌥ runs `onclick`. Items with no alternate behave as before when ⌥ is held
- [x] Right-clicking a grid cell shows "Copy ▸" holding Copy Value, Copy Field Path, Copy Sub-Document (only for objects and arrays) and Copy Document as JSON, and Copy _id (only when the document has an `_id`); each copies the same text as today
- [x] Right-clicking a grid row area with no cell shows "Copy ▸" with Copy Document as JSON (and Copy _id when present)
- [x] The grid menu's Edit Field, Edit Document, Insert Document and Delete Document items stay top-level and unchanged
- [x] The Sidebar, TreeNode and TreeView menus render and behave as before

## Verification

- `pnpm verify`
- `pnpm test src/__tests__/components/ContextMenu.test.ts` (new): submenu opens on hover and runs its item; ⌥ keydown/keyup swaps the label; ⌥-click runs the alternate; flat menus unchanged; flip-left and shift-up with mocked `getBoundingClientRect` and `window.innerWidth`/`innerHeight`
- `node scripts/run-tauri-e2e.mjs --spec tests/webdriver/specs/context-menu.e2e.mjs`: updated to open "Copy ▸" before asserting the copy items
- Manual (`pnpm dev`): run `db.<coll>.find({})`, right-click a cell, hover "Copy ▸" and confirm the five items; right-click near the right and bottom window edges and confirm the submenu stays in the viewport; the ⌥ behavior is proven by the unit test only, since no real menu uses an alternate until the copy-row spec lands

## Design

- Submenu open: pointer enters the parent item and opens it immediately; entering a different top-level item closes it after a 150 ms delay, so the pointer can cross diagonally into the submenu. Clicking or pressing Enter on the parent also opens it (it's a button, so Tab reaches it). No arrow-key navigation.
- Nesting: one level of submenu is required; the component may render nested submenus recursively, but nothing uses more than one.
- ⌥ state: tracked with window `keydown`/`keyup` (`event.altKey`) while the menu is mounted, and reset on window `blur`. The click handler reads `event.altKey` from the click itself, so the click is authoritative.
- Alternate shape: `altLabel` and `altOnclick` are set together; an item with only one of them ignores both.
- A submenu parent has no `onclick` of its own beyond opening the submenu.
- The "Copy ▸" item sits where the copy items sit today: after Edit Field, before the Edit Document separator.
- Copy submenu shows even with a single item (the row-only case) so the menu layout stays the same wherever the user right-clicks.
- Tree view's single "Copy Document as JSON" item stays a top-level item: one item doesn't need a submenu, and the TreeView menu is untouched.
- The ⌥ alternate uses `event.altKey` on every platform (Option on macOS, Alt elsewhere); the ⌥ glyph is a macOS convention only in the spec text.
- Submenu items render inside the menu's `.context-menu` DOM, so backdrop and `stopPropagation` handling covers them. The parent's label is "Copy" with a separate ▸ element; the e2e `submenuParent` selector matches by `contains`. The e2e helper opens the submenu by click, since e2e `contextmenu` events are dispatched rather than real pointer input.
- Test hooks: submenu items render in the DOM only while open, so the e2e `contextMenu.item(label)` selector keeps working once the submenu is open. Add `contextMenu.submenuParent(label)` (or similar) to `selectors.mjs`, and a helper to open a submenu in `helpers.mjs`.
- Flags: none (frontend only; no stored data, no public API).

## Boundaries

Stop and ask if: a Sidebar, TreeNode or TreeView menu needs changing for this to work.

## Log

- 2026-09-27: Migrated from tk dgr-ixns (created 2026-09-26T23:17:29Z).
- 2026-09-30: Imported from br as dgr-l0s.
- 2026-10-10: Cold read: pass, no blocking questions. Folded in: mocked-rect unit tests for flipping, ⌥ proven by unit test only, Copy item position, e2e opens the submenu by click.
- 2026-10-10: Scott Schlesier, 2026-10-10: approved after refinement. Cold read: pass
- 2026-10-31: Started on branch feat/context-menu-submenus
- 2026-10-31: Status: in-review
- 2026-10-31: Review triage: dismissed double onclose on submenu click (idempotent: ResultsGrid sets contextMenu=null, ContextMenu.onclose also fires); dismissed fitSubmenu resize re-measure (menu is short-lived); fixed unrelated e2e reformatting (my prettier run), added e2e for criteria 6-8, unit tests for M6/M15/M20.
