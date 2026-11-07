---
agent: "STOP: run `spx help --skill` and follow it before any work on this spec. Use spx for every store step; never edit the store by hand."
title: Show shortcut and modifier hints in context menus
id: too-saw
type: feature
priority: 3
depends-on: [context-menu-submenus-and-alternate-items]
approved: "Scott Schlesier, 2026-11-06: Approved after refinement: grid-only shortcut hints, bare ⌥ alternate hint, hints follow custom bindings. Cold read: pass"
status: in-review
---

Context menu items in the results grid show right-aligned hints, so users can discover the ⌥ alternate on Copy Row and the keyboard shortcuts for Edit Field, Edit Document and Insert Document.

## Context

`ContextMenu.svelte` (`src/components/ContextMenu.svelte`) renders each item as a button with a label span and, for submenu parents, an arrow. Items can declare an `altLabel`/`altOnclick` pair (only "Copy Row" does today, in `ResultsGrid.svelte`). Shortcuts live in `keybindingsStore` (`src/stores/keybindings.svelte.ts`): `getFormatted(id)` returns the platform-formatted, user-override-aware string (`⌘E` on macOS, `Ctrl+E` elsewhere). The grid binds `edit-field` (GridCell), `edit-document` (GridCell) and `insert-document` (ResultsGrid) to the same actions the menu items run. The sidebar and JSON/tree menus have no bound shortcuts and no alternates.

## Acceptance criteria

- [x] `MenuItem` accepts an optional `shortcut` string; when set, `ContextMenu` shows it right-aligned on that item's row.
- [x] An item with a complete alternate (`altLabel` and `altOnclick`) shows the modifier hint `⌥` on macOS (`Alt` elsewhere), right-aligned, whether or not ⌥ is held; a half-declared alternate shows none.
- [x] In the grid menu, Edit Field, Edit Document and Insert Document show the current binding from `keybindingsStore.getFormatted` for `edit-field`, `edit-document` and `insert-document`.
- [x] After a binding is customised in Settings, the next-opened grid menu shows the new binding.
- [x] Items with no shortcut or alternate (all sidebar and tree-view items, Copy Value, Delete Document, and so on) render exactly as before; a submenu parent still shows only its arrow.
- [x] The hint text is not part of the item's label: the `Copy Row` item's label text still reads "Copy Row" (and "Copy Row with Headers" while ⌥ is held), and the existing E2E context-menu lookups still find items by label.

## Verification

- `pnpm verify`
- `pnpm test src/__tests__/components/ContextMenu.test.ts`: new cases for shortcut hint shown, alternate hint shown with and without ⌥ held, none for a half-declared alternate or a plain item.
- A new ResultsGrid component test (`src/__tests__/components/ResultsGrid.test.ts`; none exists yet): opening the menu shows the `keybindingsStore.getFormatted` values; after `keybindingsStore.setBinding('insert-document', …)` a reopened menu shows the new value.
- `node scripts/run-tauri-e2e.mjs --spec tests/webdriver/specs/context-menu.e2e.mjs`: existing specs still pass, and one added check that the opened grid menu displays a hint on Insert Document and on Copy Row (add a `contextMenu.hint(label)` selector to `selectors.mjs`).
- Manual under `pnpm dev`: right-click a grid cell, see `⌘E`/`⌘J`/`⌘D` hints and `⌥` on Copy Row inside the Copy submenu; open a sidebar menu and see no hints.

## Design

Decisions (overrule any):

- **Hint text for alternates:** just the modifier glyph (`⌥`, or `Alt` off macOS), not a description. The label already swaps to the full alternate text while ⌥ is held. The hint is shown regardless of whether ⌥ is currently held.
- **Customised bindings:** hints follow user overrides, by reading `keybindingsStore.getFormatted(id)` each time the menu items are built (the grid builds them on every render, so no extra reactivity is needed).
- **Which menus:** `ContextMenu` supports hints generically for every user. Only the grid menu supplies shortcuts, because it is the only one with bound shortcuts; the alternate hint appears automatically on any item with an alternate. The tree view's single-item menu and the sidebar menus are unchanged.
- **Component API:** the caller passes a ready-made `shortcut` string, so `ContextMenu` does not import the keybindings store. The alternate hint is derived inside `ContextMenu` from `hasAlt`, using a small exported helper in `src/utils/keyboard.ts` that returns `⌥` on macOS and `Alt` elsewhere (same `isMac()` check as `formatShortcut`).
- **Markup:** the hint is its own `<span class="context-menu-hint" aria-hidden="true">` sibling of `.context-menu-label`, styled muted (`--color-text-secondary` or the closest existing token), with a gap so it never touches the label. The E2E selector `contextMenu.item` in `tests/webdriver/selectors.mjs` currently matches `normalize-space(.)=label` on the whole button; change it to match the `.context-menu-label` span so hints don't break lookups. `submenuParent` already uses `contains` and needs no change. The label-reading helpers in `tests/webdriver/specs/context-menu.e2e.mjs` (`getMenuLabels`, `getTopLevelLabels`, `getSubmenuLabels`) read each button's `textContent`; change them to read the `.context-menu-label` span, keeping their expected values (including `'Copy ▸'`, which they get from the label plus arrow, so for that helper read the button text minus the hint span, e.g. clone the button and remove `.context-menu-hint` before reading).
- **Alt held:** the hint stays `⌥` while the label swaps.
- No flags: no data, public API or config change.

## Boundaries

- Don't change shortcut behavior or the keybindings store.
- Don't add shortcuts to the sidebar or tree-view menus.
- Stop and ask if: hints would need a different text than the design states, or a menu item has no matching shortcut id.

## Log

- 2026-09-27: Migrated from tk dgr-j1m3 (created 2026-09-26T23:17:29Z).
- 2026-09-30: Imported from br as dgr-0z7.
- 2026-11-06: Approved: Scott Schlesier, 2026-11-06: Approved after refinement: grid-only shortcut hints, bare ⌥ alternate hint, hints follow custom bindings. Cold read: pass
- 2026-11-06: Started on branch feat/context-menu-hints
- 2026-11-06: Status: in-review: Implemented; manual pnpm dev check not done
- 2026-11-06: Manual pnpm dev check done by Scott Schlesier: grid hints and ⌥ on Copy Row look right, no hints on sidebar menus.
- 2026-11-06: Review round 1 dismissals: mutant removing class:has-hint (right-alignment) covered by Scott's manual dev check; mutant on 'item.shortcut || undefined' is equivalent; cleared-binding risk n/a (keybindings store has no unbind).
