---
id: dgr-mk2m
status: open
deps: []
links: []
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
