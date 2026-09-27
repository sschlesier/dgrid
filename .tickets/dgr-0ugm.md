---
id: dgr-0ugm
status: in_progress
deps: [dgr-keqg]
links: []
created: 2026-09-26T23:41:40Z
type: chore
priority: 2
assignee: Scott Schlesier
parent: dgr-mome
tags: [stage:agent-ready]
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
- Installing E2E tooling (`tauri-webdriver`) in the pickup environment

## Design

- Delete `e2e:headed`.
- Rename `e2e:report` to `e2e:smoke`, same command.
- Document `pnpm e2e:smoke` with one line each in the AGENTS.md command block (next to the
  `--spec` line), the Running Tests section of `.claude/rules/e2e-testing.md`, and the
  README.md testing block.
- Flag: changes contributor-facing package scripts; `e2e:report` is removed, not aliased.
- Smoke run: the runner builds the debug app itself and starts MongoDB through
  `mongodb-memory-server`, so the only external requirement is `tauri-webdriver`. If the
  runner stops with "tauri-webdriver is not installed", don't install it. Instead, fall back
  to checking that the `e2e:smoke` script string is exactly
  `node scripts/run-tauri-e2e.mjs --spec tests/webdriver/specs/smoke.e2e.mjs`, and record in
  a note that the live run was skipped and why. A build failure or a failing smoke spec is
  not a skip: stop and report it.

## Acceptance Criteria

- [ ] `package.json` has no `e2e:headed` or `e2e:report` script
- [ ] `package.json` has `e2e:smoke` set to `node scripts/run-tauri-e2e.mjs --spec tests/webdriver/specs/smoke.e2e.mjs`
- [ ] `pnpm e2e:smoke` runs only `smoke.e2e.mjs` and passes, or is skipped under the Design's missing-`tauri-webdriver` rule with a note saying so
- [ ] `pnpm e2e:smoke` is documented in AGENTS.md, `.claude/rules/e2e-testing.md` and README.md
- [ ] `rg -n 'e2e:headed|e2e:report' -g '!.tickets/**'` returns nothing

## Verification

- `pnpm verify`
- `node -p "require('./package.json').scripts['e2e:smoke']"` → the exact command above
- `pnpm e2e:smoke` → output shows only the smoke spec ran, and it passed (or the documented skip)
- `rg -n 'e2e:headed|e2e:report' -g '!.tickets/**'` → no matches

## Notes

**2026-09-26T23:49:42Z**

Refined: delete e2e:headed, rename e2e:report to e2e:smoke (same command), document it in AGENTS.md, the e2e rules file and README.md; kept separate from dgr-nebk.

**2026-09-27T00:00:12Z**

Sent back at approval review by Scott Schlesier. Questions for refinement:

1. The acceptance criterion 'pnpm e2e:smoke runs only smoke.e2e.mjs and passes' needs tauri-webdriver, a debug build and MongoDB. If the pickup environment can't run it, what should the agent do: report it and stop, or accept a lighter check (e.g. the script resolves to run-tauri-e2e.mjs --spec tests/webdriver/specs/smoke.e2e.mjs)?
2. The Design says 'no worktree needed', but the change edits package.json (not docs-only) across 4 files (~5 lines), which is past the trivial-fix exception in the user's global CLAUDE.md. Should the agent use a worktree, or should the ticket keep an explicit exception?

**2026-09-27T00:01:31Z**

Refined after send-back. Q1 (smoke run unavailable): live run stays the main check; if tauri-webdriver is missing, don't install it, verify the exact e2e:smoke script string and note the skip; build/test failures still stop. MongoDB and the debug build are handled by the runner. Q2 (worktree): removed the 'no worktree needed' line; worktree policy is left to the user's global CLAUDE.md.

**2026-09-27T00:02:19Z**

Approved for agent pickup by Scott Schlesier. Preview cold read: not run.

**2026-09-27T00:40:47Z**

Pickup blocked before any edits: couldn't create the e2e-smoke-script worktree. EnterWorktree is refused from a subagent with a cwd override, and a direct 'gtr new --from-current' was denied by the auto-mode permission classifier. Also: origin/main lacks b821f08/43cf3ad (the dgr-keqg commits), so a default gtr worktree (based on origin/main) would miss them. Needs --from-current or a push first. Ticket left open (in_progress).
