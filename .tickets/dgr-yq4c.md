---
id: dgr-yq4c
status: open
deps: []
links: [dgr-mk2m]
created: 2026-09-27T01:52:40Z
type: chore
priority: 1
assignee: Scott Schlesier
tags: [stage:refined]
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
