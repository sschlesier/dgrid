---
title: Shortcuts fire behind open modals
type: bug
priority: 3
approved: 'Scott Schlesier, 2026-09-30: suppress all dispatcher shortcuts behind aria-modal dialogs. Cold read: pass'
status: in-review
---

While a modal dialog is open, global shortcuts (`?`, new tab, close tab, and any added
later) no longer act on the UI behind it.

Context: the global dispatcher (`handleKeyDown` in `src/utils/keyboard.ts`) skips
shortcuts only when focus is in a text field. It doesn't know about modals, so with a
dialog open and focus on a button, `?` opens Settings on top of it. `/` will have the same
problem once `press-slash-to-focus-the-nearest-search` lands. Shortcuts marked
`alwaysGlobal` (Alt+T new tab, ⌘W close tab) fire even in text fields, so they also act
behind a modal, e.g. ⌘W closes the tab under an open Edit dialog.

Out of scope:

- Focus trapping or other modal keyboard handling (Tab cycling, Escape)
- Popovers and menus that aren't modal: `QueryHistory`, `ContextMenu`, the export dropdown
  and `ExportOverlay`, the update popover
- Shortcuts handled outside the dispatcher (CodeMirror keymaps, grid key handlers)

## Steps to reproduce

1. `pnpm dev`, then click New Connection.
2. Click the dialog's Form tab so focus is on a button, not a text field.
3. Press `?`.

Expected: nothing happens. Actual: the Settings modal opens on top of the Connection
dialog.

## Acceptance criteria

- [ ] With any modal from the list in Design open and focus on a non-text element, `?`
      doesn't run its handler and isn't `preventDefault`ed.
- [ ] With no modal open, `?` still opens Settings when focus is outside a text field.
- [ ] With a modal open, the new-tab and close-tab shortcuts don't run their handlers, even
      with focus in a text field inside the modal; the tab bar is unchanged.
- [ ] With no modal open, new tab and close tab keep their current behavior, including from
      inside text fields.
- [ ] A shortcut registered through the dispatcher in the future is suppressed behind a
      modal with no per-shortcut code.

## Verification

- `pnpm verify`
- `pnpm test src/__tests__/keyboard.test.ts`: new cases: with an element carrying the modal
  marker in the DOM, a non-global unmodified shortcut's handler isn't called; after the
  element is removed it is; the same holds for an `alwaysGlobal` shortcut, including when
  the event target is an input
- Each of the seven modals carries the marker: a `getByRole('dialog'|'alertdialog')` check
  for `aria-modal="true"` in the existing component tests (`ConfirmDialog`,
  `ConnectionDialog`, `EditFieldDialog`, `JsonEditorDialog`), and
  `grep -n 'aria-modal="true"'` output for `PasswordPromptDialog`, `SettingsModal` and
  `ConnectionProgressModal`
- Manual (`pnpm dev`): run the steps to reproduce → Settings doesn't open. Close the
  dialog, click empty space, press `?` → Settings opens. Open Settings, click a tab button,
  press `?` → nothing changes. Open a query tab, open a document in the JSON editor dialog
  (Edit Document), press ⌘W → the dialog stays open and the tab isn't closed; close the
  dialog, press ⌘W → the tab closes.

## Design

- **Which overlays are modals:** `ConnectionDialog`, `PasswordPromptDialog`,
  `JsonEditorDialog`, `EditFieldDialog`, `ConfirmDialog`, `SettingsModal` and
  `ConnectionProgressModal`. Each gets `role="dialog"` and `aria-modal="true"` on its
  inner dialog element, not the overlay (`role="alertdialog"` for `ConfirmDialog`), plus
  `tabindex="-1"` so `svelte/valid-compile` doesn't fail on
  `a11y_interactive_supports_focus` (the inner divs have `onclick`).
- **Detection:** the dispatcher treats a modal as open when the document contains an
  element with `aria-modal="true"`. It's checked at keypress time, so no store or
  registration is needed and a new modal opts in by carrying the attribute.
- **Rule:** while a modal is open, the dispatcher runs no shortcut handler, `alwaysGlobal`
  included. Non-global shortcuts aren't `preventDefault`ed, so the key reaches the modal
  normally (a `?` typed in a dialog input is inserted). `alwaysGlobal` shortcuts are still
  `preventDefault`ed, as today, so a suppressed ⌘W can't fall through to a webview or
  window default. `alwaysGlobal` keeps its meaning of "fires inside text fields" when no
  modal is open.
- Accepted side effects: `?` no longer toggles Settings closed while Settings is open; while
  rebinding in Settings, pressing an already-bound key doesn't run that shortcut behind the
  modal (Settings' own capture still receives it).
- No change to stored formats, public API or config.

## Boundaries

Stop and ask if: adding `role`/`aria-modal` breaks an existing E2E selector or component
test in a way that needs more than a selector update.

## Log

- 2026-09-27: Migrated from tk dgr-1ngw (created 2026-09-26T17:50:05Z).
- 2026-09-30: Imported from br as dgr-lfv. Related: `press-slash-to-focus-the-nearest-search`.
- 2026-09-30: Refined: suppress every dispatcher shortcut behind modals (alwaysGlobal included, still preventDefaulted); modals marked with role/aria-modal; cold read: pass.
- 2026-09-30: Approved: Scott Schlesier, 2026-09-30: suppress all dispatcher shortcuts behind aria-modal dialogs. Cold read: pass
- 2026-09-30: Started on branch fix/shortcuts-behind-modals
- 2026-09-30: Implemented. Assumptions: the dispatcher returns on the first matching
  shortcut while a modal is open (it doesn't scan for another match); the marker goes on
  the inner dialog element; `ConnectionProgressModal` has no `onclick`, so it gets no
  `tabindex`. Marker checks: component tests for the four tested dialogs, grep for the
  other three. Checks run: `pnpm verify` passes; E2E `smoke` and `tab-shortcuts` pass.
  Manual steps under `pnpm dev` not run yet.
- 2026-09-30: Review started
- 2026-09-30: Manual steps under `pnpm dev` run by Scott Schlesier: all as expected.
- 2026-09-30: Review round 1 triage. Fixed: test for a `?` typed in an input inside a modal
  (not preventDefaulted); marker render tests for `ConnectionProgressModal`,
  `PasswordPromptDialog` and `SettingsModal` (were grep-only). Dismissed as equivalent
  mutants: selector `[aria-modal]` (nothing sets `aria-modal="false"`); `return` →
  `continue` in the modal branch (no two shortcuts share a binding; Settings rejects
  conflicts).
- 2026-09-30: Correction to the Design's `tabindex` rationale: without `tabindex="-1"`,
  `pnpm lint` still passes; it avoids a vite-plugin-svelte build warning
  (`a11y_interactive_supports_focus`). The code is unchanged. Review round 2: pass, no open
  decisions or risks; the first-match `return` was confirmed equivalent (Settings rejects
  conflicting bindings).
