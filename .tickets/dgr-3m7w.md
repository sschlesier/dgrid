---
id: dgr-3m7w
status: open
deps: []
links: [dgr-t6hb]
created: 2026-09-27T01:49:42Z
type: chore
priority: 3
assignee: Scott Schlesier
tags: [stage:captured]
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
