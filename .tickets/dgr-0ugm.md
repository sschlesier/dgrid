---
id: dgr-0ugm
status: open
deps: [dgr-keqg]
links: []
created: 2026-09-26T23:41:40Z
type: chore
priority: 2
assignee: Scott Schlesier
parent: dgr-mome
tags: [stage:refined]
---

# Replace e2e:headed and e2e:report with e2e:smoke

Contributors running the e2e package scripts get what the script name promises:
`e2e:smoke` runs the smoke spec, and the misleadingly named scripts are gone.

Context: in `package.json`, `e2e:headed` runs exactly the same command as `e2e` (the Tauri
window is always visible locally, so there is no headless mode to switch off), and
`e2e:report` only runs `tests/webdriver/specs/smoke.e2e.mjs`; it doesn't open a report.
Neither is used by CI or current docs (only by the stale rules file that dgr-keqg
rewrites). Part of epic dgr-mome.

Out of scope:

- Adding a real headless mode or an HTML report
- Changing `scripts/run-tauri-e2e.mjs` or CI

## Design

- Delete `e2e:headed`.
- Rename `e2e:report` to `e2e:smoke`, same command.
- Document `pnpm e2e:smoke` with one line each in the AGENTS.md command block (next to the
  `--spec` line), the Running Tests section of `.claude/rules/e2e-testing.md`, and the
  README.md testing block.
- Flag: changes contributor-facing package scripts; `e2e:report` is removed, not aliased.
- A few one-line changes, no code: no worktree needed.

## Acceptance Criteria

- [ ] `package.json` has no `e2e:headed` or `e2e:report` script
- [ ] `pnpm e2e:smoke` runs only `smoke.e2e.mjs` and passes
- [ ] `pnpm e2e:smoke` is documented in AGENTS.md, `.claude/rules/e2e-testing.md` and README.md
- [ ] `rg -n 'e2e:headed|e2e:report' -g '!.tickets/**'` returns nothing

## Verification

- `pnpm verify`
- `pnpm e2e:smoke` → output shows only the smoke spec ran, and it passed
- `rg -n 'e2e:headed|e2e:report' -g '!.tickets/**'` → no matches

## Notes

**2026-09-26T23:49:42Z**

Refined: delete e2e:headed, rename e2e:report to e2e:smoke (same command), document it in AGENTS.md, the e2e rules file and README.md; kept separate from dgr-nebk.
