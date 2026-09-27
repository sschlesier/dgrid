---
id: dgr-t6hb
status: open
deps: []
links: [dgr-mk2m, dgr-3m7w]
created: 2026-09-27T01:38:13Z
type: chore
priority: 2
assignee: Scott Schlesier
tags: [stage:captured]
---

# Fix cargo audit findings and update Rust dependencies

Every vulnerability or unmaintained-crate warning reported by `cargo audit` for
`src-tauri/` is either fixed or accounted for: accepted because no fix exists, or tracked
in its own upgrade ticket. The Rust side gets the same treatment the pnpm audit ticket
gave the npm side, and the shipped app stops carrying known-vulnerable crates silently.

Context: `cargo-audit` isn't installed yet (`cargo install cargo-audit`), so there is no
baseline count. On 2026-09-27, `cargo update --dry-run` would update 192 of 229 locked
packages within their existing ranges, including `tauri` 2.11.3 → 2.12.0,
`tauri-plugin-dialog` 2.7.1 → 2.8.0, `tauri-plugin-opener` 2.5.4 → 2.6.0,
`mongodb` 3.7.0 → 3.9.1 and `tokio` 1.52.3 → 1.53.1. Run the audit at pickup and record
the baseline.

The pnpm audit ticket pinned the npm `@tauri-apps/api`, `cli`, `plugin-dialog` and
`plugin-opener` packages with `~` ranges to the minor versions of their Rust crates,
because the Tauri CLI refuses to build on a major.minor mismatch. Any Tauri crate minor
bump here has to move those npm pins with it.

Out of scope:

- Any major version upgrade of a direct dependency (e.g. `notify` 7 → 8,
  `reqwest` 0.12 → 0.13 if that counts as a break); these become follow-up chores
- Upgrading crates that have no audit finding just because they're outdated, beyond what
  `cargo update` does within existing ranges
- npm dependencies (covered by the pnpm audit ticket, dgr-mk2m)
- Adding `cargo audit` or `cargo deny` to CI
- Changing the Rust edition or MSRV

## Design (draft, to confirm in refinement)

- Order of preference for each finding:
  1. `cargo update` within existing ranges (lockfile refresh);
  2. raise a direct dependency's version requirement in `Cargo.toml` to a patched
     minor/patch version;
  3. `cargo update -p <crate> --precise <ver>` for a transitive crate, when its parent's
     range allows the patched version.
- **Fixes that need a major upgrade are skipped.** For each direct dependency that needs
  one, create a follow-up chore from the main checkout:
  `tk create "Upgrade <crate> to <major> to fix audit findings" -t chore -p <P> --tags stage:captured`.
  P1 if any advisory it clears is critical or high (CVSS ≥ 7), otherwise P2. The
  description lists the RUSTSEC IDs it clears. Link it with `tk link dgr-t6hb <new-id>`.
- Tauri crates (`tauri`, `tauri-build`, `tauri-plugin-*`) and the matching npm
  `@tauri-apps/*` packages move together, in one commit, to the same major.minor. The
  `~` ranges in `package.json` are raised to the new minor.
- Findings with no fix (or unmaintained crates with no replacement in the dependency
  tree's control) are accepted in `src-tauri/.cargo/audit.toml` under
  `[advisories] ignore = [...]`, each with a comment giving the reason.
- Unmaintained/yanked warnings that `cargo update` doesn't clear: list them in the
  completion note; no follow-up chore unless they're on a direct dependency.
- Run `cargo fmt` and commit any formatting-only changes separately
  (`style: apply cargo fmt`), per AGENTS.md.

## Acceptance Criteria

- [ ] Every vulnerability still reported by `cargo audit` is either in
      `src-tauri/.cargo/audit.toml` `ignore` (with a reason) or covered by a linked
      follow-up chore that names its RUSTSEC ID.
- [ ] Every `ignore` entry has no patched version reachable without a major upgrade of a
      direct dependency.
- [ ] No direct dependency changed its major version (for 0.x crates, its minor).
- [ ] The Tauri crates and the npm `@tauri-apps/*` packages share a major.minor, and
      `pnpm tauri info` reports no version mismatch.
- [ ] Each follow-up chore exists with stage `captured`, is linked to `dgr-t6hb`, and has
      the priority from Design.
- [ ] `pnpm verify` passes (includes `cargo clippy -D warnings` and `cargo test`), and the
      app builds and runs.
- [ ] The completion note records: audit counts before/after; each `ignore` entry and
      why; the follow-up chore IDs; any unmaintained/yanked warnings left; the Tauri
      version before/after.

## Verification

- `cargo audit` in `src-tauri/`: what's still reported matches `ignore` plus the
  follow-up chores
- `pnpm verify`
- `pnpm tauri info`: no Tauri package version mismatch
- After handoff (reviewer): the `linux-e2e` workflow passes on the PR (covers
  `tauri-plugin-webdriver` and the Tauri runtime update)
- Manual (`pnpm dev`): the app launches, connects to a local MongoDB, runs a `find`
  query and shows results; the export dialog opens (plugin-dialog) and a saved-password
  connection still connects (keyring)

## Open questions for refinement

- Should a Tauri minor bump (2.11 → 2.12) happen here even with no audit finding on it,
  since `cargo update` does it within range? Or hold Tauri at 2.11 with `~2.11` in
  `Cargo.toml` and leave the bump to its own ticket?
- Commit `.cargo/audit.toml`, or keep the ignore list in the ticket only?

## Boundaries

Stop and send back if: a fix needs a Tauri major/minor bump the npm side can't match, or
the MongoDB driver update changes query results in tests.
Don't touch: `CHANGES.md`.
Don't push or open a PR; commit locally and stop at the completion note.
