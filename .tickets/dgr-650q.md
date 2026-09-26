---
id: dgr-650q
status: open
deps: []
links: [dgr-1ngw]
created: 2026-09-26T17:45:24Z
type: feature
priority: 3
assignee: Scott Schlesier
tags: [stage:refined]
---

# Press / to focus the nearest search

Users can press `/` anywhere outside a text field to jump to the nearest search box: the
search of the results view that has focus when it has one, otherwise the sidebar's
collection filter.

Context: both search boxes already exist. The sidebar collection filter opens from the
magnifier button next to "Connections" (Escape clears, then closes). The results Tree view
has an always-visible "Search fields and values..." input (`TreeToolbar`). Neither has a
keyboard entry point. Search inputs will be added to more results views later, and they
should get the same `/` behavior.

Out of scope:

- Changing how either search matches
- Adding search or filter inputs to the Table or JSON views (future tickets)
- A command palette or search across databases/documents
- Showing the sidebar when it's hidden
- Suppressing shortcuts while a modal is open (tracked in dgr-1ngw)

## Design

- New configurable shortcut in `SHORTCUT_DEFINITIONS`: id `focus-search`, description
  "Focus search", category General, default binding `{ key: '/' }`, not `alwaysGlobal`.
  It appears in the Settings shortcut list and can be rebound like the others.
- Not global: `/` typed in the query editor, a search input or any other text field is
  inserted as normal text.
- The `/` keypress is consumed: it never shows up in the input that gets focus.
- **Routing:** find the results view that contains the focused element. If that view has
  a search input, focus it and select its text. Otherwise go to the collection filter.
  Today only the Tree view has one. "Contains focus" means the focused element is inside
  the view (a document row, a key/value cell or a toolbar button). Clicking empty,
  unfocusable space leaves focus on the page, so `/` goes to the collection filter.
- **Extensibility constraint:** routing is generic. When a results view adds a search
  input, it gets `/` just by declaring that input. The shortcut handler and the Sidebar
  don't change. The implementing agent picks the mechanism (for example a marker attribute
  on the input, or a registration call) and documents it in a short code comment where the
  shortcut is handled.
- **Collection filter:** if it's closed, `/` opens it and focuses the input. If it's open,
  `/` focuses the input and selects the existing text. `/` never closes it (unlike the
  button, which toggles). When the sidebar isn't mounted, the collection-filter branch
  does nothing.
- Escape keeps its current behavior in both inputs. Focus doesn't go back to where it was
  before.
- The collection filter button's tooltip shows the current binding, e.g. "Filter
  collections (/)". The Tree search placeholder is unchanged.
- Modals: like `?` today, `/` still fires with a modal open and focus on a non-text
  element. Accepted here; fixed separately in dgr-1ngw.

## Acceptance Criteria

- [ ] With focus outside any text field and outside any results view that has a search
      input, and the collection filter closed, pressing `/` opens the filter and focuses
      its input; the input is empty (no `/` typed).
- [ ] With the collection filter open and containing text, pressing `/` from outside a text
      field focuses the input and selects the existing text.
- [ ] With focus on a document row or field cell in the Tree view, pressing `/` focuses
      that Tree view's search input and selects its text; the collection filter doesn't
      open and no `/` is typed.
- [ ] With focus in a results view that has no search input (Table or JSON today), pressing
      `/` goes to the collection filter.
- [ ] Typing `/` in the query editor or any input inserts `/` and triggers no focus change.
- [ ] A routing test uses a fixture view with no Tree-specific code that declares a search
      input through the generic mechanism; `/` with focus in that fixture focuses its input.
- [ ] "Focus search" appears in Settings → keyboard shortcuts with default `/`; after
      rebinding it, the new key does the routing and `/` no longer does.
- [ ] The collection filter button's tooltip includes the current binding.
- [ ] Existing behavior of both searches (button toggle, Escape handling, matching, Tree
      next/previous match) is unchanged.

## Verification

- `pnpm verify`
- `pnpm test src/__tests__/components/Sidebar.test.ts`: new cases in the
  `collection filter` block for opening, focusing and selecting via `/`, and for `/`
  inside an input being ignored
- `pnpm test src/__tests__/components/TreeView.test.ts` (new file): `/` with focus on a
  tree row focuses the tree search input
- The generic routing test with a fixture view (location is the agent's choice; name it in
  the pickup note)
- `pnpm test src/__tests__/keybindings-store.test.ts`: the `focus-search` definition
  exists with default `{ key: '/' }`
- Manual (`pnpm dev`): connect and run a query.
  - Click a Table view cell, press `/` → the collection filter opens and is focused; type
    part of a collection name → the tree narrows; press Escape twice → the filter closes.
  - Switch to the Tree view, click a document row, press `/` → the tree search is focused;
    type a value → matches are highlighted.
  - Click into the query editor, type `/` → `/` appears in the editor and nothing else
    changes.
  - In Settings, rebind "Focus search" to another key → that key routes as above and `/`
    doesn't.

## Boundaries

Stop and send back if: making routing generic needs changes to the global dispatcher's
input-skipping rule or to how other shortcuts are matched.

## Notes

**2026-09-26T17:50:47Z**

Refined: / routes to the focused results view's search (Tree today, generic for future views) else the collection filter; configurable 'focus-search' binding; modal case accepted and split to dgr-1ngw; P3.
