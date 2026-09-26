---
id: dgr-1ngw
status: open
deps: []
links: [dgr-650q]
created: 2026-09-26T17:50:05Z
type: bug
priority: 3
assignee: Scott Schlesier
tags: [stage:captured]
---

# Unmodified shortcuts fire behind open modals

Unmodified global shortcuts (e.g. `?`, and `/` once dgr-650q lands) still fire while a modal dialog is open, as long as focus isn't in a text field. For example, with the Connection or Settings dialog open and focus on a button, pressing the key acts on the UI behind the modal. The dispatcher in src/utils/keyboard.ts doesn't check for open modals.
