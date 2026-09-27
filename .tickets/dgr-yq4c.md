---
id: dgr-yq4c
status: in_progress
deps: []
links: [dgr-mk2m]
created: 2026-09-27T01:52:40Z
type: chore
priority: 1
assignee: Scott Schlesier
tags: [stage:review]
---

# Upgrade vitest to 5 to fix audit findings

The TS unit and component tests run on vitest 5 (or 4.1.x if 5 is too risky, see Design),
and `pnpm audit` no longer reports GHSA-82fw-gwwq-j7x9.

vitest and `@vitest/coverage-v8` are dev only, not in the shipped bundle. Split out of
dgr-mk2m (Fix pnpm audit findings), which skips major upgrades. P1 by choice: the finding
is moderate, but we want it done soon. happy-dom is already on 20 (dgr-bbp9, merged).

Compatibility checked at refine time: vitest 5.0.2 accepts vite ^6.4 || ^7 || ^8 (we have
7.x), any happy-dom, and Node ^22.12 || ^24 (CI and local use 24). `@vitest/coverage-v8`
must match vitest's exact version. `@testing-library/svelte` 5.4.2 accepts any vitest.

Finding cleared:

- GHSA-82fw-gwwq-j7x9 — moderate (vitest and @vitest/mocker >=2.1.0 <4.1.11)

Out of scope:

- happy-dom, vite, @testing-library/\*, or any other dependency
- Fixing the `test:ui` script or adding `@vitest/ui` (the script is already broken:
  `@vitest/ui` isn't installed)
- Changing the test environment, or restructuring tests beyond what the upgrade requires

## Design

- **Review the release notes first.** Before changing anything, read the release notes /
  migration guide for every major crossed: vitest 4 (4.0 and 4.1) and vitest 5
  (vitest.dev/guide/migration, GitHub releases for `vitest-dev/vitest`). Check each
  breaking change against actual usage:
  - `vitest.config.ts`: `globals`, `environment: 'happy-dom'`, `setupFiles`,
    `resolve.conditions`, `coverage` (v8 provider, reporters, excludes)
  - `tests/setup.ts` and the `@testing-library/svelte/vitest` setup file
  - mocking across the ~30 test files: `vi.fn`, `vi.mock`, `vi.stubGlobal`,
    `vi.clearAllMocks` / `vi.restoreAllMocks`, fake timers (`vi.useFakeTimers`,
    `vi.advanceTimersByTimeAsync`)
  - the `test`, `test:coverage` scripts and how `pnpm verify` invokes vitest

  Record every breaking change in the completion note as "affects us" (with file refs) or
  "doesn't affect us" (with a one-line reason).

- **Target vitest 5; fall back to 4 only on serious risk.** Aim for the latest 5.x for
  both `vitest` and `@vitest/coverage-v8`. Fall back to the latest 4.1.x (≥ 4.1.11) if
  any of these hold for 5 but not for 4:
  - it requires changing another dependency (vite, happy-dom, @testing-library/svelte);
  - more than ~5 test files need changes;
  - `pnpm test:coverage` can't be kept working;
  - it introduces a new `pnpm audit` finding;
  - a breaking change affects app code outside the tests.

  The completion note states which major was chosen and, on fallback, which condition
  triggered it.

- If a test breaks because of a documented behavior change (mocks, spies,
  `restoreAllMocks`, timers, etc.), update the test to the new semantics. Don't skip,
  delete or loosen it.
- Flags: config change (`package.json`, lockfile, and `vitest.config.ts` if the migration
  requires it).

## Acceptance Criteria

- [ ] The completion note lists the breaking changes of each major crossed (4 and, if
      chosen, 5), each marked as affecting us (with file refs and what changed) or not
      (with a reason).
- [ ] `vitest` and `@vitest/coverage-v8` resolve to the same version: latest 5.x, or
      latest 4.1.x (≥ 4.1.11) with the fallback reason in the completion note.
- [ ] `pnpm audit` no longer reports GHSA-82fw-gwwq-j7x9 and reports no new findings.
- [ ] No test was skipped, deleted or loosened to pass. Every changed test is explained
      in the completion note.
- [ ] `pnpm test:coverage --run` completes and writes a coverage report.
- [ ] No other direct dependency changed version.
- [ ] `pnpm verify` passes.

## Verification

- `pnpm audit | grep GHSA-82fw-gwwq-j7x9` prints nothing; compare the full audit output
  to `main` for new findings
- `pnpm ls vitest @vitest/coverage-v8` shows matching versions
- `pnpm test --run`
- `pnpm test:coverage --run`
- `pnpm verify`
- `git diff main -- package.json` shows only the `vitest` and `@vitest/coverage-v8`
  lines changed

## Boundaries

Stop and send back if: even the 4.1.x fallback hits one of the serious-risk conditions in
Design; or a failure looks like a real app bug rather than a test-runner difference.
Don't touch: happy-dom, `src-tauri/`.
Don't push or open a PR; commit locally and stop at the completion note.

## Notes

**2026-09-27T02:20:15Z**

Refined: target latest vitest 5 + @vitest/coverage-v8, falling back to 4.1.x (>=4.1.11) only on the serious-risk conditions listed in Design; release notes for 4 and 5 reviewed against actual usage first; keep P1 (wanted soon despite moderate finding); no dep, happy-dom 20 already merged; test:ui fix out of scope.

**2026-09-27T02:26:56Z**

Approved for agent pickup by Scott Schlesier. Preview cold read: not run.

**2026-09-27T02:30:13Z**

Picked up; working on branch vitest-5.

**2026-09-27T02:37:10Z**

Completion note (implementing agent). Branch vitest-5, commits ae08aaf (upgrade) and 69a3233 (coverage include).

Chose vitest 5: vitest and @vitest/coverage-v8 ^3.2.7 -> ^5.0.2 (both resolve to 5.0.2). No fallback condition hit: vite 7.3.6, happy-dom 20.14.5, @testing-library/svelte 5.4.2 unchanged; 1 test file changed; test:coverage works; no new audit finding; no app code affected. package.json diff vs main: only the two vitest lines.

Breaking changes vs actual usage.

Vitest 4.0:

- Requires Vite >=6, Node >=20: doesn't affect us (vite 7.3.6, Node 24).
- V8 coverage AST remapping; ignoreEmptyLines / experimentalAstAwareRemapping removed; ignore hints changed: doesn't affect us beyond numbers (we set none of those options, no ignore hints in src).
- coverage.all / coverage.extensions removed: AFFECTS US. Files no test imports dropped out of the report (34 of 69 src files, e.g. App.svelte, grid/_, results/_), inflating All files to 71.8% statements. Fixed with coverage.include: ['src/**'] in vitest.config.ts (69a3233); all src files are reported again (All files 44% statements). Assumption: I didn't run v3 coverage for a baseline; v3's default include was broader than src, and scoping to src/** is my choice.
- Simplified default exclude: doesn't affect us (we set test.exclude explicitly).
- spyOn/fn support constructors (arrow implementations can't be new'd): doesn't affect us; no vi.spyOn, and no mock is called with new (new FileWatcher() in websocket.test.ts is the real class).
- Mocking changes (vi.fn name, restoreAllMocks only restores manual spies, automocked methods/getters): doesn't affect us. The one restoreAllMocks (src/**tests**/keyboard.test.ts:23) has no spies to restore; its vi.stubGlobal calls were never undone by restoreAllMocks before either. No automocks (all vi.mock calls use factories), no getMockName.
- Standalone filename filter, vite-node -> module runner, workspace -> projects, browser provider rework, pool rework, reporter API removals, custom element snapshot shadow roots: don't affect us (not used: no standalone, no workspace/projects/pool/browser options, no custom reporters, no snapshots).
- Deprecated APIs removed (poolMatchGlobs, environmentMatchGlobs, deps.*, test options as 3rd arg): doesn't affect us (none used; no it(name, fn, opts) calls).

Vitest 4.1:

- beforeAll/afterAll receive file/worker context instead of Suite: doesn't affect us (tests/setup.ts hooks take no arguments).
- Strict locators in webdriverio/preview browser providers: doesn't affect us (no browser mode).

Vitest 5.0:

- Requires Vite >=6.4, Node >=22.12; vite now a peer: doesn't affect us (vite 7.3.6 already a direct dependency, Node 24, pnpm).
- clearMocks on by default: doesn't affect us; no test relies on call history across tests (all 689 pass unchanged; 11 files already reset or clear their mocks explicitly).
- testNamePattern matches '>'-joined full name: doesn't affect us (no -t in scripts).
- Inline projects inherit root / nested projects / shared Vite server: doesn't affect us (no projects).
- Hoisted vi.mock/unmock/hoisted must be top-level: doesn't affect us; all 12 files call vi.mock at module scope (no indented vi.mock).
- Browser automock, locators serialized/strict, toHaveTextContent strict, async render in vitest-browser-*, toMatchScreenshot dir, orchestrator session URL, browser.api -> api: don't affect us (no browser mode; our toHaveTextContent is jest-dom's, not vitest browser's).
- Class mocks keep prototype methods: doesn't affect us (no class mocks).
- bench() rewrite: doesn't affect us (no benchmarks).
- UI needs authenticated URL: doesn't affect us (test:ui already broken, out of scope).
- Fake timers mock Temporal: doesn't affect us (app-store.test.ts uses useFakeTimers for setTimeout only; no Temporal in src).
- toThrow('') matches anything: doesn't affect us (no toThrow('')).
- Assertion types Matchers<R, T>: doesn't affect us (no custom matcher declarations; jest-dom types still type-check).
- expect.poll rejects on timeout: doesn't affect us (not used).
- Unawaited .resolves/.rejects fail the test: doesn't affect us; every .rejects in api-client.test.ts is awaited.
- Test titles use pretty-format: doesn't affect us functionally (only format.test.ts uses %i/%s in it.each titles; titles are cosmetic).
- test.sequential / describe.sequential removed: doesn't affect us (not used).
- Glob coverage thresholds / perFile: doesn't affect us (no thresholds).
- Coverage include/exclude match more precisely: doesn't affect us; our excludes (node_modules/, dist/, **/*.test.ts, **/**tests**/**) still exclude the same files (report has no test files, verified).
- Config not looked up from parent dirs: doesn't affect us (vitest.config.ts at repo root).
- DOM env global assignments update window: doesn't affect us; vi.stubGlobal('navigator'/'localStorage') in keyboard.test.ts and keybindings-store.test.ts still pass; no direct globalThis/window assignments.
- populateGlobal originals, .vitest report dir, 1-based worker IDs, resolveConfig return, @vitest/runner/ws-client deprecation, removed vitest/* entrypoints: don't affect us (none used; we only import from 'vitest', 'vitest/config').

Changed test code: src/**tests**/test-utils.ts only. createMockApi (unused anywhere) got an explicit return type Record<MockApiMethod, ReturnType<typeof vi.fn>>, because tsc -p src failed with TS2742 (inferred vi.fn type references an internal vitest chunk). No test skipped, deleted or loosened; no assertion changed.

New output (not a warning): vitest 5 prints a hint that happy-dom is created once per file and suggests pool: 'vmThreads' or isolate: false. Left alone (changing the pool/environment is out of scope).

Audit before -> after: 2 moderate (GHSA-82fw-gwwq-j7x9 via vitest and @vitest/mocker) + 2 high ignored -> 2 high ignored only. No new findings.
Tests: 689/689 before and after.
Verified: pnpm test --run, pnpm test:coverage --run (writes coverage/ report), pnpm audit (GHSA gone), pnpm ls vitest @vitest/coverage-v8 (5.0.2 both), git diff main -- package.json (two lines), pnpm verify (exit 0; includes 182 Rust tests).
