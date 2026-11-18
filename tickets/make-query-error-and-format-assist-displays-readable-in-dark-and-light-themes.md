---
agent: "STOP: run `spx help --skill` and follow it before any work on this spec. Use spx for every store step; never edit the store by hand."
title: Make query error and format-assist displays readable in dark and light themes
type: bug
priority: 2
depends-on: []
parent:
approved: "Scott Schlesier, 2026-11-17: Token-level WCAG AA contrast fix for error/warning/info displays and format-assist in both themes, with regression test. Cold read: not run"
status: done
---

Query error displays (syntax and execution errors) and the format-assist banner meet WCAG AA contrast (4.5:1 for text) in both the dark and light themes, using theme tokens instead of hardcoded translucent colors.

## Context

`QueryPanel.svelte` renders `.error-display` (error type, message `<pre>`, suggestion box, copy button) and `.format-assist` (banner and buttons). They use the status tokens in `src/styles/variables.css`, and some hardcoded `rgba(255,255,255,…)` / `rgba(0,0,0,…)` fills. Contrast ratios computed from the current tokens (WCAG 2.x):

| Pairing | Text on background | Ratio |
| --- | --- | --- |
| Dark error | `#f87171` on `#7f1d1d` | 3.62 |
| Light error | `#dc2626` on `#fee2e2` | 3.95 |
| Light warning (format-assist) | `#d97706` on `#fef3c7` | 2.86 |
| Dark warning | `#fbbf24` on `#78350f` | 5.43 (passes) |
| Light/dark success | | 6.49 / 5.23 (pass) |
| Light/dark info | | 4.24 / 4.52 (light fails) |

Hardcoded fills have no dark variant:
- `.error-suggestion`: `rgba(255,255,255,0.5)` sits on the dark red with light text.
- `.format-assist-btn`: `rgba(255,255,255,0.65)` sits on the dark amber with inherited light text.
- `.format-assist-btn.primary`: `--color-warning` background with `--color-warning-text`, the same color for text and fill in dark mode.
- `.error-message`: `rgba(0,0,0,0.05)`, which has no effect in dark mode.

The `--color-*-light` / `--color-*-text` tokens are shared by ConnectionDialog, EditFieldDialog, JsonEditorDialog, Notification, ContextMenu and QueryHistory, so fixing the tokens fixes those too.

## Acceptance criteria

- [x] In both themes, `--color-error-text` on `--color-error-light` is at least 4.5:1, and likewise for `--color-warning-text` on `--color-warning-light` and `--color-info-text` on `--color-info-light`; `--color-success-text` on `--color-success-light` stays at least 4.5:1.
- [x] In both themes, `--color-error-text` on `--color-bg-primary` and on `--color-bg-secondary` is at least 4.5:1 (it is used as text color on plain surfaces, e.g. the ContextMenu danger item and QueryHistory).
- [x] `.error-display` message, type label, suggestion box and copy button (including hover) are at least 4.5:1 (3:1 for the icon) in both themes, with no hardcoded white or black fills.
- [x] `.format-assist` banner text, the Dismiss button and the primary suggestion button are at least 4.5:1 in both themes, and the primary button is visibly distinct from the Dismiss button.
- [x] The error and warning state is not conveyed by color alone: the existing error type label and the left border remain.
- [x] A Vitest test parses `src/styles/variables.css` and asserts the ratios above for both themes, so a token change that regresses contrast fails `pnpm test`.
- [x] Other users of the shared tokens (listed in Context) stay readable. A manual check in both themes finds no pairing below 4.5:1 and no layout change.

## Verification

- `pnpm verify`.
- `pnpm test <contrast test file>` shows the ratio assertions passing, and fails if a token is set back to its current value (revert check).
- Manual under `pnpm dev`, in both Settings themes (Light, Dark):
  1. Run `db.users.find({ name: )`. Expected: an error display with readable text, a readable suggestion box and a visible copy button.
  2. Trigger format-assist, for example with a query that gets suggestions on Format. Expected: a readable banner and distinct buttons.
  3. Open the connection dialog and trigger a connection error, then the edit dialog with an invalid value. Expected: both readable.
  4. Take a screenshot of each in both themes and attach them to the PR.

## Design

- **Approach:** fix at the token level in `variables.css`, then remove the hardcoded fills in `QueryPanel.svelte`. A per-component override would leave the other consumers failing.
- **Target:** WCAG AA, 4.5:1 for text, 3:1 for icons and borders. This is the "normal" bar, and AAA is not required.
- **Tokens:**
  - Darken the light-theme `-text` colors (error, warning, info) until they pass.
  - Lighten the dark-theme `-text` colors, or darken the dark `-light` backgrounds, until error passes.
  - Keep the hue family (red, amber, blue) so the status meaning is unchanged.
  - Pick the exact hex values during implementation and record them in the Log.
- **New tokens for translucent fills:** add `--color-error-surface` (for the message and suggestion boxes, a subtle step from `--color-error-light`) and `--color-warning-surface` (for the format-assist buttons), each defined per theme and contrast-checked against the status text.
- **Primary format-assist button:** use `--color-warning-text` text on `--color-warning-light` with a `--color-warning` border, or a solid warning fill with `--color-text-inverse`, whichever passes in both themes.
- **No flags:** no data migration, public API or config change. CSS only, plus a test.

## Boundaries

Stop and ask if: fixing contrast needs a change to markup or copy in a component other than `QueryPanel.svelte`, or a token's hue has to change visibly (for example, the error color stops reading as red).
Don't touch: the CodeMirror syntax-highlighting tokens (`--syntax-*`), the `.cm-searchMatch` editor styling, or the brand/primary colors.

## Out of scope

- A full accessibility audit of the rest of the app (the muted text color `--color-text-muted` is 2.9:1 on white and is a separate spec).
- Adding a high-contrast theme.
- Editor inline lint squiggles (there are none today).

## Log

- 2026-11-17: Approved: Scott Schlesier, 2026-11-17: Token-level WCAG AA contrast fix for error/warning/info displays and format-assist in both themes, with regression test. Cold read: not run
- 2026-11-17: Started on branch fix/query-error-format-assist-contrast
- 2026-11-17: Hex values: light error-text #b91c1c, warning-text #92400e, info-text #1d4ed8; dark error-text #fca5a5; surfaces light error #fdd5d5 / warning #fde68a, dark error #611616 / warning #5c2a0b. Primary format-assist button is an inverted fill (warning-text bg, warning-light text). Criteria 3-4 ticked on computed ratios; manual theme check and screenshots (criterion 7) not done.
- 2026-11-17: Status: in-review
- 2026-11-17: Review round 1 triage: dismissed a test that greps QueryPanel.svelte for rgba fills (brittle, spec asks for token ratios only). Fixed: added warning-text on bg-primary pairing (Dismiss hover) and made the dark theme require its own token definitions.
- 2026-11-17: Review round 1 pass 1b triage: dismissed primary-hover opacity 0.9 (computed 5.15 light / 4.73 dark, both >= 4.5), a redundant 3:1 icon assertion (implied by 4.5:1 on error-surface), and an equivalent mutant (dark error-surface #611616 -> #7f1d1d). Escalated to the person: brown light warning-text, Dismiss hover tint, light warning border 1.93:1, criterion 7 manual check.
- 2026-11-17: Review round 1 answers (Scott Schlesier): brown light warning-text #92400e accepted after viewing swatches; Dismiss hover stays amber (added --color-warning-surface-hover #fcd34d light / #703610 dark); light warning border 1.93:1 accepted as a risk; criterion 7 accepted without a visual check of the six shared-token consumers.
- 2026-11-17: Status: done: Reviewed round 1: criteria 1-6 verified by tests and computed ratios; criterion 7 accepted by the person without a visual check
