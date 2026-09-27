---
id: dgr-t6hb
status: open
deps: []
links: [dgr-mk2m, dgr-3m7w]
created: 2026-09-27T01:38:13Z
type: chore
priority: 2
assignee: Scott Schlesier
tags: [stage:refined]
---

# Update Rust dependencies, upgrade Tauri to 2.12 and fix cargo audit findings

The shipped app runs on the latest Tauri 2.x with every Rust dependency refreshed within
its semver range, and `cargo audit` reports no vulnerabilities for `src-tauri/`.

Context: baseline on 2026-09-26 (`cargo audit` in `src-tauri/`): 5 vulnerabilities —
RUSTSEC-2026-0204 `crossbeam-epoch` 0.9.18, RUSTSEC-2026-0258 `h2` 0.4.15,
RUSTSEC-2026-0194 and RUSTSEC-2026-0195 `quick-xml` 0.39.4 (via `plist` ← `tauri`, CVSS
7.5 DoS), RUSTSEC-2026-0285 `rustls` 0.23.40 — plus warnings: unmaintained `instant`,
`proc-macro-error` and five `unic-*` crates; unsound `anyhow` 1.0.102, `event-listener`
5.4.1, `glib` 0.18.5; yanked `chacha20` 0.10.0. `cargo update --dry-run` moves all five
vulnerable crates and `anyhow`, `event-listener` and `chacha20` to fixed versions.

Latest releases on 2026-09-26: `tauri` 2.12.0 (locked 2.11.3), `tauri-build` 2.7.0
(2.6.3), `tauri-plugin-dialog` 2.8.0 (2.7.1), `tauri-plugin-opener` 2.6.0 (2.5.4);
npm `@tauri-apps/api` and `cli` 2.12.0, `plugin-dialog` 2.8.0, `plugin-opener` 2.6.0.
`tauri-plugin-webdriver` 0.2.3 is already latest.

The pnpm audit ticket pinned the npm `@tauri-apps/*` packages with `~` ranges to the
minor versions of their Rust crates, because the Tauri CLI refuses to build on a
major.minor mismatch. They move together here.

Out of scope:

- Tauri 3 or any other major version upgrade of a direct dependency (for 0.x crates, a
  minor: e.g. `notify` 7 → 8, `reqwest` 0.12 → 0.13); these become follow-up chores
- Changing the `tauri-webdriver` CLI pin (0.2.0) or `tauri-plugin-webdriver`'s `0.2` range
- npm dependencies other than the four `@tauri-apps/*` packages
- Adding `cargo audit` or `cargo deny` to CI
- Changing the Rust edition or MSRV
- Adopting new Tauri 2.12 features or APIs

## Design

- **Target versions:** the latest 2.x release of each Tauri crate and its npm package at
  pickup (2.12 / 2.7 / 2.8 / 2.6 as of 2026-09-26). If a newer 2.x minor has shipped by
  then, take it; the rules below apply unchanged.
- **Release notes:** before changing anything, read the changelogs for every Tauri minor
  crossed — `tauri` 2.12, `tauri-build` 2.7, `tauri-plugin-dialog` 2.8,
  `tauri-plugin-opener` 2.6, and the matching `@tauri-apps/api`, `cli`, `plugin-dialog`
  and `plugin-opener` releases — and check each breaking or behavior change against how
  the repo uses them (`src-tauri/src/`, `src-tauri/capabilities/`,
  `src-tauri/tauri.conf.json`, `src/api/`, and every `@tauri-apps/*` import in `src/`).
- **Cargo.toml requirements:** raise `tauri`, `tauri-build`, `tauri-plugin-dialog` and
  `tauri-plugin-opener` from `"2"` to the new major.minor (e.g. `"2.12"`, caret semantics).
  A fresh lockfile then can't fall below the minor the npm `~` pins expect. Leave every
  other requirement as is.
- **npm pins:** raise the four `~` ranges in `package.json` to the new versions (e.g.
  `~2.12.0`) and update `pnpm-lock.yaml`. The Tauri crates and npm packages move in the
  same commit.
- **Lockfile:** run a full `cargo update` in `src-tauri/` (every crate, within its
  existing range), as its own commit, separate from the Tauri bump.
- **Generated files:** if the build regenerates `src-tauri/gen/schemas/*`, commit the
  result with the Tauri bump.
- **Audit leftovers:** any vulnerability still reported after the update that needs a
  major upgrade of a direct dependency gets a follow-up chore, created from the main
  checkout:
  `tk create "Upgrade <crate> to <major> to fix audit findings" -t chore -p <P> --tags stage:captured`,
  P1 if any advisory it clears has CVSS ≥ 7, otherwise P2, with the RUSTSEC IDs in the
  description, linked with `tk link dgr-t6hb <new-id>`. A vulnerability with no fix at
  all goes in `src-tauri/.cargo/audit.toml` (`[advisories] ignore = [...]`, a comment
  with the reason for each entry). Create that file only if it has an entry.
- **Warnings** (unmaintained, unsound, yanked) that remain: list them in the completion
  note, with no follow-up chore. The expected ones (`instant`, `proc-macro-error`,
  `unic-*`, `glib` 0.18) come in through Tauri's own dependency tree (gtk3 / urlpattern
  / proc-macro stack), which this repo doesn't control.
- **Commits:** (1) `chore(deps): cargo update`; (2)
  `chore(deps): upgrade Tauri to 2.x` (Cargo.toml, Cargo.lock, package.json,
  pnpm-lock.yaml, regenerated schemas); (3) any code changes the release notes require,
  one per change; (4) `style: apply cargo fmt` if it changes anything.
- Flags: dependency update only, no migration, no public API or config format change.

## Acceptance Criteria

- [ ] `cargo audit` in `src-tauri/` reports 0 vulnerabilities, or each one left is in
      `audit.toml` with a reason or named in a linked follow-up chore.
- [ ] `Cargo.lock` locks `tauri` 2.12.0 or newer 2.x, `tauri-build` 2.7+,
      `tauri-plugin-dialog` 2.8+ and `tauri-plugin-opener` 2.6+.
- [ ] `src-tauri/Cargo.toml` requires those four crates at their new major.minor.
- [ ] The four npm `@tauri-apps/*` packages share each crate's major.minor, and
      `pnpm tauri info` reports no version mismatch.
- [ ] No direct dependency changed its major version (for 0.x crates, its minor), apart
      from the Tauri minors above.
- [ ] `pnpm verify` and `cargo test` (in `src-tauri/`) pass, and `pnpm build` produces
      the app bundle.
- [ ] The completion note records: audit counts before/after; the Tauri versions
      before/after; each release-note breaking or behavior change as "affects us" (with
      file refs) or "doesn't affect us" (with a reason); any `audit.toml` entries and
      follow-up chore IDs; the warnings left.

## Verification

- `cargo audit` in `src-tauri/`
- `pnpm tauri info`: no Tauri package version mismatch
- `pnpm verify`
- `cargo test` in `src-tauri/`
- `pnpm build`
- `pnpm e2e` (covers the Tauri runtime and `tauri-plugin-webdriver` with the new Tauri)
- Manual (`pnpm dev`): the app launches; create a connection to a local MongoDB with a
  saved password, quit and relaunch, connect (keyring); open a collection and run
  `db.<coll>.find({})`, results show; click Export and pick a file (plugin-dialog), the
  file is written; in the query panel, open a query file (plugin-dialog `open`); click the
  version link at the bottom of the sidebar (plugin-opener) and the GitHub release page
  opens in the browser.

## Boundaries

Stop and send back if: a release note forces a change to IPC contracts, capabilities or
stored data; `tauri-plugin-webdriver` 0.2.x doesn't build against the new Tauri; the
MongoDB driver update changes query results in tests.
Don't touch: `CHANGES.md`.
Don't push or open a PR; commit on the branch and stop at the completion note.

## Notes

**2026-09-27T03:04:25Z**

Refined: Tauri upgrade to latest 2.x (2.12 on 2026-09-26) folded in with cargo update and audit fixes; baseline 5 vulns, all cleared by cargo update; Cargo.toml Tauri requirements raised with caret to the new minor; stays P2 (quick-xml reached only via Tauri's plist parsing).
