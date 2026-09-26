---
id: dgr-gdxy
status: open
deps: []
links: [dgr-5qm3]
created: 2026-09-26T22:45:04Z
type: task
priority: 2
assignee: Scott Schlesier
tags: [stage:refined]
---

# Design favorite collections UI

Scott gets a visual GUI design for favorite collections, with mockups and a
recommendation, ready to approve and use to refine dgr-5qm3.

Context: in a large server, users find the same few collections by expanding the sidebar
tree (connection → database → collection → indexes) or using the sidebar filter every
time. The goal is quick access: a favorite collection should be one click away. Today
the sidebar has a collection filter and a right-click menu on collections ("Open in New
Tab", "Copy Collection Name"); there is no favorites, pin or bookmark feature.

Out of scope:

- Storage, persistence format, Tauri commands and stores: decided in dgr-5qm3
- Any change under `src/` or `src-tauri/`
- Favoriting databases, connections or saved queries
- Creating or refining implementation tickets

## Design

The design must answer each question with a recommendation and the reason for it. There is
no preferred direction; judge options by how quickly a user reaches a favorite collection.

1. Where favorites show (for example a Favorites section at the top of the sidebar, favorites
   sorted first within their database, a star marker in the tree, or a mix). At least two
   options, each mocked up.
2. How to add and remove a favorite: right-click menu item, star on hover, keyboard shortcut.
3. How each state looks: no favorites yet; the connection is disconnected (favorites shown,
   greyed out or hidden); the collection no longer exists; the sidebar filter is active.
4. Order: alphabetical, order added, or drag to reorder.
5. Clicking a favorite: behaves like clicking the collection in the tree (connects if needed,
   opens the query tab), unless the design argues otherwise.
6. Proposed split of dgr-5qm3 into implementation tickets (proposal only).

Decision: mockups are made with Claude Design (a Design artifact), not ASCII. The mockups
follow the current sidebar's look (`Sidebar.svelte`, `TreeNode.svelte`) in the default
theme; a dark-theme variant is optional.
Decision: the written design lives at `plans/FAVORITES-DESIGN.md` and links to the Claude
Design artifact for each option. The doc is the record; the artifact holds the visuals.

## Acceptance Criteria

- [ ] `plans/FAVORITES-DESIGN.md` answers design questions 1–6, each with a recommendation
- [ ] Question 1 has at least two options, each with a Claude Design mockup linked from the doc
- [ ] The recommended option has mockups for the states in question 3
- [ ] A note on dgr-5qm3 points to `plans/FAVORITES-DESIGN.md`
- [ ] No files under `src/` or `src-tauri/` are changed

## Verification

- `pnpm verify`
- Manual: open `plans/FAVORITES-DESIGN.md`; each of questions 1–6 has a recommendation; each
  mockup link opens a Claude Design artifact showing that option
- Manual: `tk show dgr-5qm3` has a note linking the design doc

## Boundaries

Stop and send back if: Claude Design is unavailable or can't produce sidebar mockups; don't
fall back to ASCII mockups without asking.
Don't touch: `src/`, `src-tauri/`, `CHANGES.md`, and don't refine or split dgr-5qm3 yourself.

## Notes

**2026-09-26T22:50:20Z**

Refined: GUI-only design (storage deferred to dgr-5qm3); mockups via Claude Design, written design at plans/FAVORITES-DESIGN.md; no preferred direction, quick access is the goal.
