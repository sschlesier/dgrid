---
id: dgr-ixns
status: open
deps: []
links: []
created: 2026-09-26T23:17:29Z
type: feature
priority: 2
assignee: Scott Schlesier
tags: [stage:captured]
---

# Context menu submenus and ⌥ alternate items; group grid copy items under Copy

The grid cell/row context menu groups its copy actions under a single 'Copy ▸' submenu, and menu items can have a ⌥ (Option) alternate, so the upcoming copy features (dgr-mlct, dgr-ee3k, dgr-3fcq) don't flood the menu. Today ContextMenu.svelte is a flat list of {label, onclick, destructive, separator} with Escape-to-close and viewport flipping, and no keyboard navigation. It's used by ResultsGrid, Sidebar, TreeNode and TreeView. Scope: (1) submenu support in ContextMenu (hover opens it, flips left or up at the viewport edge); (2) alternate items: an item can declare altLabel/altOnclick; while ⌥ is held the label swaps live (the macOS convention), and ⌥-click runs the alternate; (3) move the existing grid copy items (Copy Value, Copy Field Path, Copy Sub-Document, Copy Document as JSON, Copy \_id) into a 'Copy' submenu in the grid menu. Other menus (Sidebar, Tree) unchanged. Open questions for refinement: submenu open delay and hover-intent, keyboard access, whether Tree view's copy items also move, and whether ⌥ state is read from keydown/keyup while the menu is open or only at click.
