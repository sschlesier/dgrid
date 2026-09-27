---
id: dgr-bbp9
status: closed
deps: []
links: [dgr-mk2m]
created: 2026-09-27T01:37:17Z
type: chore
priority: 1
assignee: Scott Schlesier
tags: [stage:review]
---

# Upgrade happy-dom to 20 to fix audit findings

The TS unit and component tests run on happy-dom 20, and `pnpm audit` no longer reports
happy-dom's critical and high findings.

happy-dom is the Vitest DOM environment (`environment: 'happy-dom'` in `vitest.config.ts`),
dev only and not in the shipped bundle. Split out of dgr-mk2m (Fix pnpm audit findings),
which skips major upgrades. Independent of dgr-yq4c (vitest 4): vitest 3 accepts any
happy-dom version, and happy-dom 20 needs Node >=20 (CI and local use 24).

Findings cleared:

- GHSA-37j7-fg3j-429f — critical (<20.0.0)
- GHSA-6q6h-j7hj-3r64 — high (>=15.10.0 <=20.8.7)
- GHSA-w4gp-fjgq-3q4g — high (<20.8.9)

Out of scope:

- Upgrading vitest or @vitest/\* (that's dgr-yq4c)
- Switching to jsdom or another DOM environment
- Other audit findings, and any other dependency upgrades
- Rewriting tests beyond what's needed for them to pass on happy-dom 20

## Design

- **Review the release notes first.** Before changing anything, read the release notes /
  changelog for every major crossed: happy-dom 16, 17, 18, 19 and 20 (GitHub releases
  for `capricorn86/happy-dom`). Check each breaking change against actual usage:
  `vitest.config.ts`, `tests/setup.ts`, and the DOM APIs exercised by tests and components
  under `src/__tests__/`. Record every breaking change in the completion note as "affects
  us" (with file refs) or "doesn't affect us" (with a one-line reason).
- Set `happy-dom` to `^20.8.9` or higher (the latest 20.x at pickup). Don't go to 21+ if
  it exists.
- If a test breaks because happy-dom 16–20 changed DOM behavior, fix the test to match
  correct browser behavior. Don't pin to the old quirk, and don't skip or delete the test.
- If a test only passes because of a happy-dom bug in 20.x, a narrow workaround in the
  test or in `tests/setup.ts` is fine, with a comment naming the happy-dom issue.
- No manual app check: the shipped bundle doesn't include happy-dom.
- Flags: config change (`package.json` and lockfile only).

## Acceptance Criteria

- [ ] The completion note lists the breaking changes from happy-dom 16–20, each marked
      as affecting us (with file refs and what changed) or not (with a reason).
- [ ] `package.json` lists `happy-dom` at `^20.x` with x ≥ 8.9, and the lockfile
      resolves it to ≥ 20.8.9.
- [ ] `pnpm audit` no longer reports GHSA-37j7-fg3j-429f, GHSA-6q6h-j7hj-3r64 or
      GHSA-w4gp-fjgq-3q4g.
- [ ] No test was skipped, deleted or loosened to pass. Every changed assertion is
      explained in the completion note.
- [ ] No other direct dependency changed version.
- [ ] `pnpm verify` passes.

## Verification

- `pnpm audit | grep -E 'GHSA-(37j7-fg3j-429f|6q6h-j7hj-3r64|w4gp-fjgq-3q4g)'` prints
  nothing
- `pnpm test --run` (all of `src/__tests__/`, including `components/`)
- `pnpm verify`
- `git diff main -- package.json` shows only the `happy-dom` line changed

## Boundaries

Stop and send back if: more than ~5 test files need changes; a failure looks like a real
app bug rather than an environment difference; or a breaking change affects app code
outside the tests (anything under `src/` other than `src/__tests__/`).
Don't touch: vitest / @vitest/\* versions, `src-tauri/`.
Don't push or open a PR; commit locally and stop at the completion note.

## Notes

**2026-09-27T02:06:53Z**

Refined: happy-dom -> latest 20.x (>=20.8.9); release notes for 16-20 reviewed against actual usage first and recorded in the completion note; tests follow correct browser behavior, no skips; no dep on dgr-yq4c; send back if >5 test files change or app code outside tests is affected.

**2026-09-27T02:08:03Z**

Approved for agent pickup by Scott Schlesier. Preview cold read: not run.

**2026-09-27T02:08:45Z**

Picked up; working on branch happy-dom-20.

**2026-09-27T02:12:27Z**

Completion note (implementing agent). Branch happy-dom-20, commit 18c59cc.

happy-dom ^15.11.7 -> ^20.14.5 (lockfile 20.14.5). package.json diff vs main: only the happy-dom line. Lockfile: happy-dom plus its own new deps (ws, entities 7, buffer-image-size, @types/ws, @types/whatwg-mimetype).

Breaking changes 16-20 vs actual usage (happy-dom is only referenced as environment: 'happy-dom' in vitest.config.ts; nothing imports it):

- v16 HTML/XML parser + serializer rewrite: affects us only indirectly. Svelte 5 renders component templates and TreeNode.svelte {@html} SVG icons through the parser; covered by the component tests (Sidebar.test.ts renders TreeNode), all pass. No tests assert on innerHTML/outerHTML or snapshots.
- v17 ESM support in scripts; setAttribute() rejects invalid attribute names: doesn't affect us. No script elements in tests; the only setAttribute calls use 'data-theme' (src/stores/app.svelte.ts:703,705).
- v18 strict types, BrowserContext.close() on default context throws: doesn't affect us. We don't import happy-dom types or its Browser API (skipLibCheck is true anyway).
- v19 CommonJS removed: doesn't affect us. Vitest loads it as ESM; Node 24 locally and in CI (>=20 required).
- v20 JavaScript evaluation disabled by default: doesn't affect us. No script tags, inline on* handlers or eval inside the DOM in tests or setup.

Tests: 689/689 pass before and after; no test files changed, no new warnings.
Audit before -> after: 1 critical / 4 high (2 ignored) / 2 moderate -> 0 critical / 2 high (2 ignored, extract-zip) / 2 moderate. GHSA-37j7-fg3j-429f, GHSA-6q6h-j7hj-3r64, GHSA-w4gp-fjgq-3q4g no longer reported.
Verified: pnpm test --run, pnpm audit grep (empty), pnpm verify (exit 0; includes 182 Rust tests).

**2026-09-27T02:18:45Z**

Merged to main in 95d2a18 (branch happy-dom-20, 18c59cc). Re-checked on main: package.json happy-dom ^20.14.5, lockfile 20.14.5, pnpm audit no longer reports the three GHSAs, package.json diff is the happy-dom line only. Closing.
