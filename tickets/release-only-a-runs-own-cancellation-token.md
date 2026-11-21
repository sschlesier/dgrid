---
agent: "STOP: run `spx help --skill` and follow it before any work on this spec. Use spx for every store step; never edit the store by hand."
title: Release only a run's own cancellation token
type: bug
priority: 3
depends-on: [run-a-shell-script-through-mongosh-from-the-backend]
parent:
approved: "Scott Schlesier, 2026-11-16: Shared release-only-your-own-token helper for execute_query, export_csv and execute_shell; connection maps and the shared per-tab key out of scope. Cold read: not run"
status: in-review
---

A query, export or shell run that finishes never removes another run's cancellation token, so Cancel always reaches the run that is in progress on a tab.

## Context

`execute_query`, `export_csv` and `execute_shell` share `AppState.cancellation_tokens`, keyed by tab id. Each registers a token under the tab when it starts, cancelling the tab's previous token. `cancel_query` and `cancel_export` remove the tab's token and cancel it.

When `execute_query` (`src-tauri/src/commands/query.rs:58-61`) and `export_csv` (`src-tauri/src/commands/export.rs:220-223`) finish, they remove the tab's entry unconditionally. If a newer run registered on the same tab first, they remove the newer run's token, and Cancel then does nothing for that run. A shell run never times out, so it keeps running until it ends by itself.

`execute_shell` (`src-tauri/src/commands/shell.rs`, from the shell backend spec) already releases only its own token. But it checks `is_cancelled()` before taking the write lock, so a newer run can register in between and still have its token removed.

Found in review of the shell backend spec (PR #53) and accepted there as a follow-up.

## Acceptance criteria

- [x] When run A on a tab finishes after run B has registered on the same tab, the tab's entry is still B's token, and cancelling the tab cancels B.
- [x] When a run finishes and no newer run has registered on its tab, the tab's entry is removed.
- [x] A run that was cancelled through `cancel_query` or `cancel_export`, then finishes, leaves a token registered afterwards on the same tab in place.
- [x] A run without a tab id stores nothing in the map and removes nothing when it finishes.
- [x] Starting a run on a tab still cancels the tab's previous run (unchanged behavior).
- [x] `execute_query`, `export_csv` and `execute_shell` all register and release through the shared helper; none of them calls `remove` on `cancellation_tokens` directly.
- [x] Query execution, export and cancel behave as before for a single run per tab: the existing Rust tests and the E2E specs for query execution, export and multi-query pass.

## Verification

- `pnpm verify`
- `cargo test` in `src-tauri/`: unit tests on the shared helper, one per criterion 1-5, each built around a `RwLock<HashMap<String, CancellationToken>>` with no Tauri `State`.
- Criterion 6: `git grep -n "cancellation_tokens" src-tauri/src` lists, outside `state.rs` and the helper module, only calls to the helper and the two cancel commands.
- `MONGODB_TEST_URI=mongodb://localhost:27017 cargo test -- --ignored shell` in `src-tauri/` with `mongosh` on PATH still passes (the shell cancel tests go through the moved helper).
- Criterion 7: `node scripts/run-tauri-e2e.mjs --spec tests/webdriver/specs/query-execution.e2e.mjs`, then the same with `export.e2e.mjs` and `multi-query.e2e.mjs`.

## Design

**Flags:** none.

**Decisions:**

- **Shared helper:** new module `src-tauri/src/cancellation.rs`, registered in `lib.rs`, with
  - `register(tokens, key: Option<&str>) -> CancellationToken`: the current `register_token` from `commands/shell.rs`, moved unchanged.
  - `release(tokens, key: Option<&str>, token: &CancellationToken)`: takes the write lock, then removes the entry only when the stored token `==` `token`. `CancellationToken`'s `PartialEq` is identity (`Arc::ptr_eq` on its inner state, tokio-util 0.7.20), so a clone compares equal and a newer token does not.
  - A `TokenMap` type alias for `RwLock<HashMap<String, CancellationToken>>`.
- **Callers:**
  - `execute_query`: replace its inline registration and cleanup with `register` and `release`. On cancel it returns `QueryCancelled` from inside `select!`, as now. Calling `release` on that path too is harmless, since the stored token is no longer its own.
  - `export_csv`: its key is the required `tab_id: String`. It calls `register(…, Some(&request.tab_id))` and `release(…, Some(&request.tab_id), &token)`.
  - `execute_shell`: switches to the module and deletes its private copies. Its token tests move to `cancellation.rs`, and `shell_run_is_cancelled_through_its_tab_id` stays in `commands/shell.rs`, calling `cancellation::register` and `release`.
- **Lock discipline:** the identity check and the `remove` happen under one write-lock guard. This closes the window `execute_shell`'s current check leaves open.
- **Cancel commands:** `cancel_query` and `cancel_export` are not changed; they still remove and cancel whatever token the tab holds.

## Boundaries

- Don't touch: the connection and test-connection token maps (`connection_tokens`, `test_connection_tokens`). The frontend: no change is needed.
- Out of scope: queries, exports and shell runs share one key per tab, so starting one cancels another running on the same tab. That stays as is.
- Stop and ask if: a caller needs a different release rule than "remove only my own token".

## Log

- 2026-11-16: Approved: Scott Schlesier, 2026-11-16: Shared release-only-your-own-token helper for execute_query, export_csv and execute_shell; connection maps and the shared per-tab key out of scope. Cold read: not run
- 2026-11-16: Started on branch fix/release-own-cancel-token
- 2026-11-16: Implemented in d9aaa62 (helper + execute_shell), 8f8f7ea (execute_query), 34c106b (export_csv). Helper tests in src-tauri/src/cancellation.rs; making release unconditional fails the two race tests. pnpm verify passed; 17 ignored shell tests pass. Criterion 6: git grep shows only helper calls plus cancel_query and cancel_export.
- 2026-11-16: Assumption: execute_query now also calls release on its cancel path (it returned early before); harmless because the stored token is no longer its own, as the Design says.
- 2026-11-21: Criterion 7: E2E query-execution (4 passing), export (2 passing), multi-query (8 passing) on macOS, 2026-11-16.
- 2026-11-21: Status: in-review
- 2026-11-21: Review round 1 fixes: shared test helper for the cancel commands (044ff05); lock-ordering test that kills the check-before-lock mutant (2d12666); E2E cancel journey in query-execution.e2e.mjs, which fails when execute_query registers with no tab id (checked by running the mutant).
- 2026-11-21: Dismissed (round 1): dropping release in a command (mutants on query.rs:49, export.rs:212, shell.rs:20) is not observable to the user: the stale entry is a finished run's token, which the next register on that tab or a cancel removes and cancels harmlessly.
- 2026-11-21: Review round 1, second cold verify fixes: E2E for a server-rejected query, kills the error-becomes-cancelled mutant (927d059); execute_shell body moved to run_with_tab_token so the ignored tab-id test covers the command's wiring, kills the register-with-None mutant (see next commit); lock test runtime stated explicitly.
- 2026-11-21: Dismissed (second cold verify): the E2E cancel test's $where sleep may outlive the test on the server; the whole spec ran in 4.5 s with no stall, and server-side JavaScript stops when its client disconnects (probe 2026-11-16). Equivalent mutants in release (is_cancelled instead of identity; release(None) on a fixed key) decide the same way within the API.
- 2026-11-21: Final cold verify (46b9899): criteria 1-6 verified; criterion 7 E2E could not run because the macOS screen was locked (CGSSessionScreenIsLocked true; dialogs never open), same failure in the PR worktree at 20:01Z. E2E to be rerun with the screen unlocked.
- 2026-11-21: Dismissed (final verify): identity check vs contains_key && !is_cancelled is equivalent (every path that replaces or removes an entry cancels it under the same guard); calling release on the cancel path is the Design's stated choice. Server-error E2E now asserts the error display only, not MongoDB's wording (d-commit after 46b9899).
