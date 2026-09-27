---
id: dgr-t6hb
status: in_progress
deps: []
links: [dgr-mk2m, dgr-3m7w]
created: 2026-09-27T01:38:13Z
type: chore
priority: 2
assignee: Scott Schlesier
tags: [stage:review]
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
- **Order:** the Tauri bump comes first, the full lockfile refresh second. With the old
  `"2"` ranges a full `cargo update` would move `Cargo.lock` to the new Tauri minor while
  the npm pins still hold the old one, and the Tauri CLI refuses to build on that
  mismatch. So the Tauri commit updates the lockfile only for the Tauri crates
  (`cargo update -p tauri -p tauri-build -p tauri-plugin-dialog -p tauri-plugin-opener`,
  plus whatever cargo must move with them), and a later commit runs a full
  `cargo update` in `src-tauri/` (every crate, within its existing range).
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
- **Commits**, each one building and passing `pnpm verify`: (1)
  `chore(deps): upgrade Tauri to 2.x` (Cargo.toml, Cargo.lock, package.json,
  pnpm-lock.yaml, regenerated schemas, plus any code change the release notes make
  necessary for the build to pass); (2) `chore(deps): cargo update`; (3) any other code
  changes the release notes call for, one per change; (4) `style: apply cargo fmt` if it
  changes anything.
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
- [ ] Every commit on the branch builds and passes `pnpm verify` (in particular, no
      commit has the Tauri crates and npm packages on different minors).
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
- Agent, before handoff: every command above, run after the last commit; `pnpm verify`
  also run after each commit.
- Reviewer, after handoff (needs a person; the agent doesn't do these): the
  `linux-e2e` workflow passes on the PR, and in `pnpm dev` the app launches; create a connection to a local MongoDB with a
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

**2026-09-27T03:05:43Z**

Sent back by Scott Schlesier at approval review. Questions: (1) Commit order: with the "2" ranges, the full cargo update in commit 1 already moves Cargo.lock to Tauri 2.12 while npm is still pinned ~2.11, so the Tauri CLI build fails between commits. Should the Tauri bump (Cargo.toml requirements, cargo update -p for the four Tauri crates, npm pins) come first and the full cargo update second? (2) The manual pnpm dev checks (native file dialogs, browser opening, relaunch for keyring) can't be done by an unattended agent. Should they move to a 'reviewer, after handoff' verification line, leaving the agent the automated commands?

**2026-09-27T03:06:38Z**

Refined after send-back. (1) Commit order: yes, the Tauri bump comes first (Cargo.toml requirements, cargo update -p for the four Tauri crates, npm pins), then the full cargo update; every commit must build and pass pnpm verify (added as an acceptance criterion). (2) Manual checks: yes, the pnpm dev checks and linux-e2e moved to a reviewer-after-handoff verification line; the agent runs the automated commands.

**2026-09-27T03:11:36Z**

Approved for agent pickup by Scott Schlesier. Preview cold read: pass (non-blocking spec issues: edit Cargo.toml before the targeted cargo update -p; unic-* warnings likely cleared by the Tauri bump; '2.x' in commit template means the actual minor).

**2026-09-27T03:25:19Z**

Completion (branch upgrade-tauri-2-12: 4007f3e Tauri upgrade, a73d6dc cargo update; cargo fmt no changes).
Audit: before 5 vulns (RUSTSEC-2026-0204 crossbeam-epoch, -0258 h2, -0194/-0195 quick-xml, -0285 rustls) + 11 warnings; after 0 vulns + 3 warnings. No audit.toml, no follow-up chores.
Tauri before/after: tauri 2.11.3->2.12.0, tauri-build 2.6.3->2.7.0, plugin-dialog 2.7.1->2.8.0, plugin-opener 2.5.4->2.6.0; npm api/cli 2.11->2.12.0, plugin-dialog 2.7->2.8.0, plugin-opener 2.5->2.6.0. pnpm tauri info: no mismatch. Direct deps: minor/patch only (mongodb 3.7.0->3.9.1, tokio 1.52.3->1.53.1, reqwest 0.13.4->0.13.5, uuid, serde, thiserror...).
Release notes: none affects us. ACL deny scoping: doesn't affect us (capabilities/default.json has no deny rules). Channel/listener leak fixes and unlisten guard: benefit only, src/api/websocket.ts and src/stores/export.svelte.ts use listen/unlisten unchanged. exit-code transfer, asset://, menu/tray, dynamic-acl, setBackgroundColor, path.normalize: APIs not used. InvokeMessage::state deprecation: not used in src-tauri/src. withGlobalTauri plugin script change: not set in tauri.conf.json. MSRV 1.90: local rustc 1.98, CI installs stable. tauri-build edition 2024: our crate stays on 2021. productName default warning: ours is DGrid. Android/iOS/Windows-only changes: we ship macOS/Linux desktop only (Windows fixes irrelevant to bundle).
Warnings left: instant 0.1.13 (unmaintained, via notify-types <- notify 7, a direct dep; notify 8 would drop it, out of scope as a major); proc-macro-error 1.0.4 (unmaintained) and glib 0.18.5 (unsound), both Linux-only via gtk 0.18 <- muda/tauri. The unic-* crates were removed by the Tauri bump.
Checks after last commit: pnpm verify pass (689 TS tests, clippy, 182 Rust tests), pnpm build pass (DGrid.app + dmg), pnpm e2e 20/20 specs pass. Reviewer still to do: linux-e2e on the PR and the pnpm dev manual checks.

**2026-09-27T03:25:29Z**

Correction to the completion note: we do ship Windows (release.yml build-windows, NSIS). The Windows items in the release notes still don't affect us, for these reasons: default_window_icon now loads from the embedded icon resource and bundle icon .ico is resolved relative to the config dir (src-tauri/tauri.conf.json sits next to icons/, so same path); focus, redirection bitmap and multi-webview fixes are bug fixes or opt-in features. Not verified on Windows locally; the release workflow's build-windows job is the check.

**2026-09-27T03:34:19Z**

Scope extended at the user's request after review of the notify 8 release notes: notify 7 -> 8.2.0 on this branch (7d52a6e), overriding the ticket's out-of-scope rule for direct-dep majors. Breaking changes: MSRV 1.77 (doesn't affect us, rustc 1.98/CI stable); notify-types 2 replaces instant with opt-in web-time (affects us: removes RUSTSEC-2024-0384 instant); Windows FILE_NOTIFY_INFORMATION unaligned-read fix (internal, no API change). src-tauri/src/commands/files.rs compiled unchanged. Added 6bdf29c: watcher setup extracted to create_file_watcher plus a real-backend unit test (write to a watched temp file, expect new content); confirmed it fails if Modify events are ignored. Audit now: 0 vulns, 2 warnings (proc-macro-error, glib 0.18; Linux-only via gtk <- tauri). pnpm verify passes (183 Rust tests). Reviewer: also check reload of an externally edited query file in pnpm dev; linux-e2e/verify CI runs the watcher test on inotify.
