---
id: dgr-mk2m
status: closed
deps: []
links: [dgr-bbp9, dgr-t6hb, dgr-yq4c]
created: 2026-09-26T18:02:08Z
type: chore
priority: 2
assignee: Scott Schlesier
tags: [stage:refined]
---

# Fix pnpm audit findings

Every critical or high vulnerability reported by `pnpm audit` is either fixed or
accounted for: accepted because no fix exists, or tracked in its own upgrade ticket. The
dev toolchain and shipped bundle stop carrying known exploitable dependencies silently.

Context: on 2026-09-26, `pnpm audit` reported 101 findings (2 critical, 48 high, 43
moderate, 8 low); `--prod` reported 29 (10 high). Criticals: vitest <3.2.6 (in range) and
happy-dom <20 (needs a major upgrade). Most highs come in through @wdio/\*, @typescript-eslint,
eslint-plugin-svelte and vite (rollup, postcss). extract-zip (via @wdio/cli) has no patched
version. Re-run the audit at pickup; counts will have drifted.

Out of scope:

- Any major version upgrade of a direct dependency (these become follow-up chores, see
  Design)
- Upgrading packages that have no audit finding (e.g. TypeScript 7, ESLint 10,
  Vite 8, Vitest 5) just because they're outdated
- Rust/Cargo dependencies (`cargo audit`)
- Adding an audit step to CI
- Moving `vite` from `dependencies` to `devDependencies`

## Design

- Order of preference for each finding:
  1. update within the existing semver range (`pnpm update`, lockfile refresh);
  2. raise the direct dependency's range to a patched minor/patch version;
  3. a `pnpm.overrides` entry forcing a patched version of the dependency that pulls in
     the vulnerable package, only when the parent package allows it (its tests and ours
     still pass).
- **Fixes that need a major upgrade are skipped.** For each direct dependency that needs a
  major upgrade to clear a critical or high finding, create one follow-up chore from the
  main checkout:
  `tk create "Upgrade <pkg> to <major> to fix audit findings" -t chore -p <P> --tags stage:captured`.
  Use **P1** if any finding it clears is critical, otherwise **P2**. The description lists
  the GHSA IDs and severities it clears. Link it with `tk link dgr-mk2m <new-id>`. These
  findings are _not_ added to `ignoreGhsas`, so they stay visible in the audit. (Today
  this likely means P1 `happy-dom` 15 → 20, and possibly `@wdio/*`.)
- `@tauri-apps/api` and `@tauri-apps/cli` stay on the same minor version as the `tauri`
  crate in `src-tauri/Cargo.toml`. Don't bump them past it.
- Findings with no patched version (currently extract-zip) are accepted: add their GHSA IDs
  to `pnpm.auditConfig.ignoreGhsas`.
- Moderate/low: fix them when options 1–3 resolve them; otherwise leave them and list
  them in the completion note. They don't block completion and get no follow-up chore.
- Flags: config change: `package.json` gains `pnpm.overrides` and/or
  `pnpm.auditConfig`.

## Acceptance Criteria

- [ ] Every critical/high finding still reported by `pnpm audit` is either in
      `pnpm.auditConfig.ignoreGhsas` or covered by a linked follow-up chore that names its
      GHSA ID.
- [ ] Every `ignoreGhsas` entry has no patched version available.
- [ ] No direct dependency changed its major version.
- [ ] `@tauri-apps/api` and `@tauri-apps/cli` share a minor version with the `tauri`
      crate.
- [ ] Each follow-up chore exists with stage `captured`, is linked to `dgr-mk2m`, and has
      priority P1 if it clears a critical finding, otherwise P2.
- [ ] `pnpm verify` passes and the app builds and runs.
- [ ] The completion note records: audit counts before/after by severity; each
      `pnpm.overrides` entry and why; each `ignoreGhsas` entry and why; the follow-up
      chore IDs; any moderate/low left unfixed.

## Verification

- `pnpm audit --audit-level high`: compare what's still reported against `ignoreGhsas`
  plus the follow-up chores; nothing is left over
- `pnpm verify`
- After handoff (reviewer, not the implementing agent): the `linux-e2e` workflow passes
  on the PR (covers the @wdio/\* updates; the WebdriverIO suite isn't run locally). The
  agent lists any `@wdio/*` version changes in the completion note so the reviewer knows
  to check it.
- Manual (`pnpm dev`): the app launches, connects to a local MongoDB, runs a `find` query
  and shows results in the Table view; the query editor works, with autocomplete showing.

## Boundaries

Stop and send back if: a fix needs `@tauri-apps/*` bumped past the Rust crate's version.
Don't touch: `src-tauri/Cargo.toml` / `Cargo.lock`.
Don't push or open a PR; commit locally and stop at the completion note.

## Notes

**2026-09-26T18:06:34Z**

Refined: goal is no unaccounted critical/high in pnpm audit; fixes limited to in-range/minor bumps and overrides; any major upgrade is skipped and split into a follow-up chore (P1 if it clears a critical, else P2), including happy-dom; unfixable findings go in ignoreGhsas; P2.

**2026-09-27T01:38:14Z**

Completion note (implementing agent).

Audit before → after: all deps 2 critical / 48 high / 43 moderate / 8 low → 1 critical / 4 high (2 ignored) / 2 moderate / 0 low. --prod: 10 high / 16 moderate / 3 low → 0.

Fixes: pnpm update within existing ranges (commit 4116371). @tauri-apps/api, cli, plugin-dialog and plugin-opener pinned with ~ to their Rust crates' minors (api 2.11.1, cli 2.11.5, plugin-dialog 2.7.3, plugin-opener 2.5.5); the in-range update had pulled them to 2.12 / 2.8 / 2.6.

pnpm.overrides: mocha>serialize-javascript ^7.0.3 (GHSA-5c6j-r48x-rmvq, high). @wdio/mocha-framework pins mocha ^10.8.2, which wants serialize-javascript ^6; 7.x has the same CJS API (mocha 12 uses it), and mocha 10 only loads it in parallel mode.

pnpm.auditConfig.ignoreGhsas: GHSA-7pqw-9j4j-h8q3, GHSA-jmr9-qjv8-65gv (extract-zip <=2.0.1 via @wdio/cli > @puppeteer/browsers; 2.0.1 is the latest release, no fix exists).

Follow-up: dgr-bbp9 Upgrade happy-dom to 20 (P1; clears critical GHSA-37j7-fg3j-429f, high GHSA-6q6h-j7hj-3r64 and GHSA-w4gp-fjgq-3q4g).

Moderate left unfixed: GHSA-82fw-gwwq-j7x9 (vitest / @vitest/mocker <4.1.11, needs a major upgrade).

@wdio/* changes for the reviewer: @wdio/cli, junit-reporter, local-runner, mocha-framework, spec-reporter and webdriverio 9.25.0 → 9.32.0; expect-webdriverio 5.6.5 → 5.7.0. The linux-e2e workflow must pass on the PR.

Verified: pnpm verify passes (689 TS tests, 182 Rust tests, clippy, frontend build); tauri info shows npm/crate minors aligned. Not done: the manual pnpm dev check (connect, find query, Table view, autocomplete) and the linux-e2e run.

**2026-09-27T02:57:31Z**

Remaining verification done by the user: the manual pnpm dev check (connect, find query, Table view, autocomplete) and linux-e2e both pass. Fixes are on main (4116371, a485c50, a6899ac); follow-ups dgr-bbp9 (happy-dom 20) and dgr-yq4c (vitest 5) are merged and closed. pnpm audit on main reports only the 2 ignored extract-zip highs. Closing.
