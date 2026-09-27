---
id: dgr-3m7w
status: closed
deps: []
links: [dgr-t6hb]
created: 2026-09-27T01:49:42Z
type: chore
priority: 3
assignee: Scott Schlesier
tags: [stage:review]
---

# Upgrade tauri-webdriver and tauri-plugin-webdriver to 0.2 and pin them

The E2E driver (`tauri-webdriver`, a cargo-installed binary) and the in-app plugin
(`tauri-plugin-webdriver` crate) move to 0.2 together, and both are pinned so a local
machine and CI always run the same versions.

Context (2026-09-27):

- Plugin: `src-tauri/Cargo.toml` has `tauri-plugin-webdriver = "0.1"` (locked 0.1.2);
  latest is 0.2.3. It's registered in `src-tauri/src/lib.rs` (`tauri_plugin_webdriver::init()`).
- Driver: installed unpinned in two places: `pnpm e2e:install-driver`
  (`cargo install tauri-webdriver`) and `.github/workflows/linux-e2e.yml`
  ("Install tauri-webdriver" step). Latest is 0.2.0.
- The versions have already drifted: CI's run on the TTL duration PR (run 36284426019)
  used driver **0.2.0** with plugin **0.1.2** and passed. A local machine that installed
  earlier has driver 0.1.1. Nothing forces them to agree.
- Driver 0.2.0's one breaking change: `POST /session` without
  `tauri:options.application` is now rejected. `tests/webdriver/wdio.conf.mjs` already
  sets `application`, so this shouldn't affect us.
- Plugin 0.2.x release notes on GitHub cover 0.2.1 (empty) and 0.2.3 (screenshot fixes on
  Linux/Windows, deps); there are no notes for 0.1 → 0.2.0. Read the compare view
  (github.com/Choochmeque/tauri-plugin-webdriver/compare/v0.1.2...v0.2.3) at pickup for
  API changes to `init()`.
- Plugin 0.2.3's example app targets tauri 2.11, the same minor as dgrid.

Out of scope:

- Other Rust dependency updates (the Rust dependency audit ticket, dgr-t6hb)
- Changing the E2E runner, specs or WebdriverIO versions beyond what the upgrade needs
- The user's local `update-all-plugins` / `cargo install-update` setup (dotfiles, not
  this repo)

## Design (draft, to confirm in refinement)

- Plugin: `tauri-plugin-webdriver = "0.2"` in `Cargo.toml`, `cargo update -p
tauri-plugin-webdriver`, and adjust `lib.rs` if the init API changed.
- Driver: pin both installs to the same version with a lockfile:
  `cargo install tauri-webdriver --version 0.2.0 --locked` in the `e2e:install-driver`
  script and in the CI workflow. `--locked` builds with the crate's own `Cargo.lock`.
- Keep the driver version in one place if that's cheap (e.g. a `TAURI_WEBDRIVER_VERSION`
  env var in the workflow, read from `package.json`'s script); otherwise two exact pins,
  and a comment in each pointing at the other.
- CI caching: `cargo install` currently skips because the binary is already present in
  the cache ("Ignored package `tauri-webdriver v0.2.0` is already installed"). With an
  exact `--version`, cargo reinstalls when the cached version differs; confirm that in
  the CI log.

## Acceptance Criteria

- [ ] `Cargo.lock` has `tauri-plugin-webdriver` 0.2.x.
- [ ] `pnpm e2e:install-driver` and the `linux-e2e` workflow install the same exact
      `tauri-webdriver` version, with `--locked`.
- [ ] The CI log's "Install tauri-webdriver" step shows the pinned version.
- [ ] `pnpm e2e` passes locally with the pinned driver; `linux-e2e` passes on the PR.
- [ ] `pnpm verify` passes.

## Verification

- `pnpm e2e:install-driver && tauri-webdriver --version` (or `cargo install --list`)
- `pnpm e2e`
- `pnpm verify`
- Reviewer: `linux-e2e` on the PR, and the version in its install step log

## Open questions for refinement

- Pin exactly (`--version 0.2.0`) or allow patches (`--version ~0.2`)? Exact keeps local
  and CI identical; `~0.2` picks up fixes without a PR.
- Do this before, after or as part of the Rust dependency audit ticket?

## Boundaries

Stop and send back if: plugin 0.2 needs a Tauri minor bump, or E2E specs need more than
mechanical changes.
Don't touch: `CHANGES.md`.
Don't push or open a PR; commit locally and stop at the completion note.

## Notes

**2026-09-27T02:55:10Z**

Completion note (implementing agent). Picked up directly from captured at the user's request; open questions resolved as: exact pin (`--version 0.2.0 --locked`), done before the Rust dependency audit ticket.

Branch `webdriver-0.2` (worktree ~/src/worktrees/dgrid/webdriver-0.2), 2 commits, not pushed:

- e8d3c4d chore(deps): tauri-plugin-webdriver "0.1" -> "0.2" in Cargo.toml; Cargo.lock 0.1.2 -> 0.2.3. No lib.rs change.
- 2950f3d build(e2e): `e2e:install-driver` is now `cargo install tauri-webdriver --version 0.2.0 --locked`; the linux-e2e "Install tauri-webdriver" step runs `pnpm e2e:install-driver`, so the version lives only in package.json. AGENTS.md and .claude/rules/e2e-testing.md no longer call the install "one-time".

Breaking changes (0.1 -> 0.2):

- Driver 0.2.0: `POST /session` without `tauri:options.application` is rejected. Doesn't affect us: tests/webdriver/wdio.conf.mjs:54 sets `application`.
- Plugin 0.2.x: no upstream notes for 0.2.0 and no v0.1.2 tag to compare against, so I diffed the published crate sources. Public Rust API only gained items (`init_with_port`, `DEFAULT_PORT`, `PORT_ENV_VAR` = TAURI_WEBDRIVER_PORT). `init()` has the same signature and the same default port 4445, which the driver's `--native-port` default matches. Doesn't affect us: src-tauri/src/lib.rs:23 calls `init()`, and nothing sets TAURI_WEBDRIVER_PORT. The WebDriver handler internals changed, which the E2E run covers.
- Dependency tree: on Linux the plugin now pulls glib 0.22 (+ system-deps 9) alongside gtk's glib 0.18; on macOS objc2 0.5 is gone (0.6 only). Only the linux-e2e build exercises the Linux side.

Verified: `pnpm e2e` locally (macOS, plugin 0.2.3 + driver 0.2.0): 20/20 specs pass. `pnpm verify` passes (689 TS tests, 182 Rust tests, clippy). A scratch `cargo install tauri-webdriver --version 0.2.0 --locked` builds cleanly. `cargo install --list` shows tauri-webdriver v0.2.0. The binary has no `--version` flag.

For the reviewer: the linux-e2e run on the PR, and its "Install tauri-webdriver" log line showing v0.2.0 (on a warm cache it says "already installed"; with an exact --version, cargo reinstalls if the cached version differs).

Unrelated finding: `cargo clippy --all-targets -D warnings` (Rust 1.98.1) fails on approx_constant `3.14` literals in tests (src/bson_ser.rs:233,234,337,338; src/csv.rs:255). pnpm verify doesn't lint test targets, so this doesn't block anything.

**2026-09-27T02:56:48Z**

Merged to main in 8c28ae7 (branch webdriver-0.2, e8d3c4d + 2950f3d) at the user's request, before linux-e2e ran on a PR, so the Linux build (glib 0.22) is first exercised by CI on the next push. Re-checked on main: Cargo.lock has tauri-plugin-webdriver 0.2.3, e2e:install-driver pins 0.2.0 --locked, and cargo clippy -D warnings passes. Closing.
