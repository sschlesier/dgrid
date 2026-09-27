---
id: dgr-keqg
status: open
deps: []
links: []
created: 2026-09-26T23:36:52Z
type: chore
priority: 1
assignee: Scott Schlesier
parent: dgr-mome
tags: [stage:agent-ready]
---

# Rewrite e2e-testing rules for the WebdriverIO suite

Agents writing E2E tests get conventions from `.claude/rules/e2e-testing.md` that match the
active WebdriverIO suite in `tests/webdriver/`, not the retired Playwright suite.

Context: the rules file still says E2E is disabled and documents the Playwright suite in
`tests/e2e/` (paths, fixtures, `page.*` APIs, `global-setup.ts`, a 13-spec list). The
active suite runs WebdriverIO + mocha against the real Tauri app via `tauri-webdriver`
(`tests/webdriver/`, `scripts/run-tauri-e2e.mjs`, 20 specs). AGENTS.md was updated in
847ed66 and flags the rules file as stale in two places. Part of epic dgr-mome.

Out of scope:

- Deleting or changing the Playwright suite in `tests/e2e/` (dgr-nebk)
- Fixing the misleading `e2e:headed` / `e2e:report` package scripts (dgr-0ugm)
- Changing test code, helpers, selectors, `wdio.conf.mjs` or `scripts/run-tauri-e2e.mjs`
- Other rules files (`testing.md`, `typescript.md`, `api-design.md`)

## Design

- This is a full rewrite of the 180-line file in its existing section layout, in one PR.
  Docs only: no worktree needed.
- Keep the file name `.claude/rules/e2e-testing.md` and roughly the same section layout
  (file organization, imports, structure, selectors, MongoDB setup, common patterns,
  before-writing checklist, coverage, anti-patterns, debugging, running tests).
- Every path, helper, selector group and command named in the file must exist in the repo
  at pickup. Examples are adapted from real specs (e.g. `field-autocomplete.e2e.mjs`,
  `query-execution.e2e.mjs`), not invented.
- Keep the suite-independent guidance (subsumption check, right test level, extend
  before creating, test generic interactions once, user journeys not widget behavior).
  Rewrite the Playwright-specific anti-patterns as WebdriverIO equivalents (e.g. use
  `waitForDisplayed` / `browser.waitUntil`, not `browser.pause`; no inline selectors; no
  retries to mask flakiness).
- Document the `__dgridTest` editor bridge and the `dispatchQueryEditor*` helpers, since
  CodeMirror can't be driven reliably with raw keystrokes.
- Running tests: document only `pnpm e2e`, `pnpm e2e:ci`, `pnpm e2e:install-driver` and
  `--spec` via `node scripts/run-tauri-e2e.mjs`, matching AGENTS.md. Don't document
  `e2e:headed`, `e2e:report` or the nonexistent `e2e:ui`.
- Mention `tests/e2e/` once, as reference only (pointer to its README). dgr-nebk removes
  that pointer later.
- Spec list: generate it from `tests/webdriver/specs/` at pickup, one line per spec
  saying what it covers.
- Update AGENTS.md so it no longer calls the rules file stale (the "When adding a
  feature" note and the Common Patterns bullet) and points to it as current.

## Acceptance Criteria

- [ ] `.claude/rules/e2e-testing.md` no longer says E2E is disabled
- [ ] The file mentions `playwright`, `tests/e2e`, `page.` or `fixtures.ts` only in the one reference-only pointer
- [ ] Every repo path in the file exists, and every `pnpm` script it names exists in `package.json`
- [ ] Every helper named in the file is exported from `tests/webdriver/helpers.mjs` or `runtime.mjs`
- [ ] The spec list matches the files in `tests/webdriver/specs/` exactly
- [ ] The file explains the test-isolation pattern (`resetApp`, `cleanupDatabase` / `seedDatabase`, `readRuntimeInfo`) and where failure artifacts go
- [ ] AGENTS.md no longer says the rules file describes the old Playwright suite
- [ ] Only `.claude/rules/e2e-testing.md` and `AGENTS.md` change

## Verification

- `pnpm verify`
- `rg -n -i 'playwright|tests/e2e|page\.|fixtures\.ts|disabled' .claude/rules/e2e-testing.md`
  → at most the single reference-only line
- For every backticked repo path in the file, `test -e <path>`; for every helper,
  `rg -n 'export async function <name>' tests/webdriver/`
- Compare `ls tests/webdriver/specs` with the spec list in the file → no difference
- `git diff --stat main` → only the two files
- Optional: `node scripts/run-tauri-e2e.mjs --spec tests/webdriver/specs/smoke.e2e.mjs`
  passes (sanity check that the documented command works)

## Boundaries

Stop and send back if: a documented convention would need a test-code or helper change to
become true (report it rather than changing code).

## Notes

**2026-09-26T23:42:01Z**

Refined: full rewrite of .claude/rules/e2e-testing.md for WebdriverIO in one docs-only PR (no worktree), plus AGENTS.md stale-pointer cleanup; scripts fix split to dgr-0ugm and Playwright removal to dgr-nebk under epic dgr-mome.

**2026-09-26T23:56:18Z**

Approved for agent pickup by Scott Schlesier. Preview cold read: pass.
