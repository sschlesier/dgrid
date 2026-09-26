---
id: dgr-nebk
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

# Delete the Playwright suite and its dependency

Contributors and agents find one E2E suite in the repo (`tests/webdriver/`), with no
Playwright code, dependency or config left to mislead them.

Context: the Playwright suite in `tests/e2e/` was written for the pre-Tauri Node backend,
no longer runs, and is kept as reference only (`tests/e2e/README.md`). Every one of its 13
specs has a same-named WebdriverIO spec in `tests/webdriver/specs/`. Part of epic dgr-mome.

Out of scope:

- `plans/*.md` (historical; keeps its Playwright mentions)
- Removing `mongodb-memory-server` (`scripts/run-tauri-e2e.mjs` uses it)
- The `e2e:headed` / `e2e:report` scripts (dgr-0ugm)
- Changing `tests/webdriver/`, `scripts/run-tauri-e2e.mjs` or CI workflows

## Design

- Delete `tests/e2e/` entirely.
- Remove the `@playwright/test` devDependency with `pnpm remove @playwright/test` (updates
  `pnpm-lock.yaml`); don't hand-edit the lockfile.
- `vitest.config.ts`: drop `'tests/e2e/**'` from `test.exclude`.
- `.gitignore`: drop `playwright-report/` and `tests/e2e/.mongo-info.json`. Keep
  `test-results/` (generic name, harmless).
- `README.md`: drop the `tests/e2e/          Playwright E2E tests` project-structure line.
- `AGENTS.md`: drop the "the Playwright suite in `tests/e2e/` is kept as reference only"
  clause in the Testing Standards bullet.
- `.claude/rules/e2e-testing.md`: drop the single reference-only pointer that dgr-keqg adds.
- Touches code and config, not only docs: use a worktree.

## Acceptance Criteria

- [ ] `tests/e2e/` does not exist
- [ ] `@playwright/test` is absent from `package.json` and `pnpm-lock.yaml`; `mongodb-memory-server` is still in `package.json`
- [ ] `rg -il 'playwright|tests/e2e' -g '!plans/**' -g '!.tickets/**'` returns nothing
- [ ] `pnpm verify` passes and Vitest collects the same number of test files as before the change

## Verification

- `pnpm verify`
- `rg -il 'playwright|tests/e2e' -g '!plans/**' -g '!.tickets/**'` → no matches
- `pnpm test run` before and after → same test-file count
- `node scripts/run-tauri-e2e.mjs --spec tests/webdriver/specs/smoke.e2e.mjs` passes
  (confirms `mongodb-memory-server` still resolves)

## Boundaries

Stop and send back if: anything outside `tests/e2e/` imports from `tests/e2e/` or `@playwright/test`.

## Notes

**2026-09-26T23:49:42Z**

Refined: delete tests/e2e/ and @playwright/test (via pnpm remove), strip vitest/.gitignore/README/AGENTS/rules-file references; keep mongodb-memory-server, test-results/ and plans/\*.md; worktree required.
