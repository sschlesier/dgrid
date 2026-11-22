---
agent: "STOP: run `spx help --skill` and follow it before any work on this spec. Use spx for every store step; never edit the store by hand."
title: Stop the server operation when a run is cancelled
type: feature
priority: 3
depends-on: [run-a-shell-script-through-mongosh-from-the-backend]
parent:
approved: "Scott Schlesier, 2026-11-16: Kill server work on cancel for queries, exports and shell runs; wait up to 5 s; warn the user if the stop fails; backend sets the shell appName. Cold read: blocked on one question (shell appName: mongosh's URI parser only loads inside the repo), answered and folded in"
status: in-review
---

When a user cancels a query, a CSV export or a shell run, dgrid also stops the operation still running on the MongoDB server. If it can't stop it, dgrid warns the user that the operation may still be running.

## Context

Today Cancel only stops dgrid's side, and the server keeps going:

- `execute_query` drops the in-flight driver call (`tokio::select!` in `src-tauri/src/commands/query.rs`).
- `export_csv` checks its token only between documents (`src-tauri/src/commands/export.rs`), so a cancel during a slow batch waits for that batch.
- `execute_shell` kills the mongosh process (`src-tauri/src/shell.rs`).

Probed on 2026-11-16 against the local mongod 9.0.4 (standalone), with a throwaway database:

- A plain `updateMany({}, {$inc: {n: 1}})` over 2,000,000 documents takes about 7 s. With its mongosh client SIGKILLed after 2 s, it went on to update all 2,000,000 documents. A disconnect does not stop it.
- A `$where: "sleep(100) || true"` write stopped at once when its client was killed. Server-side JavaScript notices the disconnect, so tests must not use it, or they pass without this change.
- From a second connection, `killOp` on the operation's opid stopped the write (623,120 updated). So did `killSessions` on its `lsid` (607,605 updated). Both times the client got `Interrupted … operation was interrupted`.
- Finding the operation by `$currentOp: {allUsers: false}` matched on `appName` also returned mongosh's monitoring connection, which has no `lsid`.
- A connection whose URI carries `appName=X` shows as `appName: X` in `$currentOp`.
- `require('mongodb-connection-string-url')` in a mongosh script loads only when mongosh runs from inside the dgrid repo, which has the module through its dev dependencies. Run from `/`, it fails with `Cannot find module` (checked 2026-11-16, mongosh 2.14.2). Scripts get no access to mongosh's own copy. So the installed app cannot rely on modules resolved from the working directory.

Today a cancelled query or export shows nothing: the query store returns quietly on `QueryCancelledError` (`src/stores/query.svelte.ts`), and the export store resets its state when the error contains "cancelled" (`src/stores/export.svelte.ts`).

Found in review of the shell backend spec (PR #53), where the person asked for a follow-up spec covering queries and shell runs. Exports were added when this spec was drafted.

## Acceptance criteria

- [ ] Cancelling, by tab id, an `execute_query` running a slow non-JavaScript write (see Verification) makes it fail with `DgridError::QueryCancelled`. Within 2 s after it returns, the written document count stops changing, stays below the total, and `$currentOp` shows no operation on that namespace.
- [ ] The same holds for a slow aggregation run through `execute_query`: after cancel, `$currentOp` shows no operation on that namespace.
- [ ] Cancelling an `export_csv` whose query is slow per batch makes it fail with `QueryCancelled` within 1 s of the cancel, even while it waits for a batch. Afterwards `$currentOp` shows no operation on that namespace.
- [ ] Cancelling an `execute_shell` run whose script runs the same slow write gives the same result as for queries: `QueryCancelled`, the count stops below the total, no operation left. The existing criterion still holds: no mongosh child of the app is left running.
- [ ] While a shell run is in progress, the server reports its connection's `appName` as `dgrid-shell-<uuid>`, unique per run, even when the connection URI sets its own `appName`. mongosh runs with the run's temp directory as its working directory.
- [ ] If stopping the server operation fails or gets no answer within 5 s, the cancelled query, export or shell run fails with `DgridError::CancelledServerStillRunning`, no later than 5 s after the cancel. Its message is `Cancelled, but the server operation may still be running: <reason>`.
- [ ] For that error, `executeQuery` and `executeShell` in `src/api/client.ts` throw a `QueryCancelledError` whose `serverWarning` is the message. For a normal cancel, `serverWarning` is `null`.
- [ ] A query run or Run All cancelled with a `serverWarning` shows a warning notification with that text. A run cancelled without one shows nothing, as today.
- [ ] An export cancelled with that error resets the export state like a normal cancel and shows a warning notification with the message.
- [ ] Runs that are not cancelled behave as before: the existing Rust and Vitest tests, and the E2E specs for query execution, multi-query, results views, field editing and export, pass.

## Verification

- `pnpm verify`
- `cargo test` in `src-tauri/`:
  - Unit tests of the URI `appName` rewrite. Cases: no options; no path; a database path; an existing `appName` in any letter case, alone or among other options; several hosts; percent-encoded credentials holding `%3F` and `%26`; `mongodb+srv`; a trailing `?` or `&`.
  - A unit test of the bounded server stop for criterion 6, using a stand-in stop that never completes and `tokio::time::pause`.
  - A second unit test where the stand-in stop fails.
  - Both assert `CancelledServerStillRunning` and its message, and that the run returns after the 5 s limit, not later.
- `MONGODB_TEST_URI=mongodb://localhost:27017 cargo test -- --ignored killop` in `src-tauri/`, with `mongosh` on PATH, runs the ignored integration tests for criteria 1-5. Each uses its own database and drops it afterwards, following the existing `#[ignore]` + `MONGODB_TEST_URI` pattern. Without a Tauri `State`, the export test calls the export's inner function the same way the command does. It passes a progress callback (see Design).
  - **Slow write:** each document's work must be server-side computation, not JavaScript. One option is an update pipeline whose `$set` holds a `$reduce` over a large `$range`, sized to take several seconds locally. Check that the test fails with the kill turned off, since a JavaScript-based or too-fast write passes either way.
  - **Slow aggregation and slow export:** the same kind of computation, in an aggregation `$project` and in a find filter's `$expr`.
- Vitest:
  - `pnpm test src/__tests__/api-client.test.ts` (criterion 7).
  - `pnpm test src/__tests__/query-store.test.ts` (criterion 8: single run and Run All).
  - `pnpm test src/__tests__/export-store.test.ts` (criterion 9).
- Criterion 10: `node scripts/run-tauri-e2e.mjs --spec tests/webdriver/specs/<feature>.e2e.mjs` for `query-execution`, `multi-query`, `results-views`, `field-editing` and `export`.
- Not verifiable locally (no auth-enabled, replica set or sharded server): own-session kills under access control, and kills through mongos. Record as unverified in the review.

## Design

**Flags:** none. (No stored data or config. The new error string is internal IPC. The shell connection's `appName` changes, which only shows in server logs and `$currentOp`.)

**Decisions:**

- **Queries and exports use an explicit session.**
  - `execute_query` and `export_csv` start a `ClientSession` from the pooled client for each run, with `causal_consistency(false)` so reads behave as with implicit sessions.
  - The session goes to every driver call they make. That covers every operation in `executor.rs`, plus the export's `get_total_count` and `open_cursor`, through `.session(&mut session)`. Cursors become session cursors.
  - Each run keeps `session.id()` (the `lsid`).
- **The export notices a cancel at once.** `export_csv` races its inner work against the token in a `tokio::select!`, the same shape as `execute_query`. A cancel during a slow batch then ends the run without waiting for the batch. The between-documents token check stays.
- **The query and export stop is one command.** On cancel, dgrid sends `killSessions: [<lsid>]` on the `admin` database through the pooled client. `killSessions` also ends the session's open cursors.
- **Shell runs get a per-run `appName`, set by the backend** (decided 2026-11-16). Before `DGRID_SHELL_URI` is set, `shell.rs` rewrites the URI's options with a pure function `with_app_name(uri, name) -> String`. The name is `dgrid-shell-<uuid>`, using the run's temp-dir uuid. The prelude is not changed for this.
  - **Rewrite rules:** the options are everything after the first `?`. A `?` inside credentials is percent-encoded, so the first one starts the options. Every option whose key equals `appName`, ignoring case, is removed, and `appName=<name>` is appended. With no `?`, the rewrite appends `?appName=<name>` when a `/` follows the host list, and `/?appName=<name>` otherwise. The name needs no encoding.
  - **Same handling as before:** the URI is still never an argument or written to a file.
- **mongosh runs from the run's temp directory.** The spawn sets `current_dir` to the run's temp directory, so neither the app nor the tests depend on where dgrid was started from.
- **The shell stop finds sessions by `appName`.** On cancel, after the child is killed and waited for (the existing order), dgrid runs `$currentOp: {allUsers: false}` matched on `appName: dgrid-shell-<uuid>` through the pooled client. It collects the distinct `lsid` values and sends one `killSessions` with them. Operations without an `lsid` (monitoring) are skipped. Finding no operations is a success.
- **Only own operations, no new privileges.** `$currentOp` with `allUsers: false` and `killSessions` on one's own sessions need no extra role when access control is on. The mongosh run authenticates as the same user as the pool, so its sessions count as the pool user's own.
- **Bounded, and the run waits for it** (decided 2026-11-16). The whole server stop (currentOp plus killSessions) runs under one 5 s `tokio::time::timeout`. The run returns only after the stop finishes or hits the limit, so "cancelled" in the UI means the server was told to stop.
- **A failed stop warns the user** (decided 2026-11-16).
  - **Backend error:** a failure or timeout of the stop returns the new `DgridError::CancelledServerStillRunning(String)` instead of `QueryCancelled`. Its `Display` is `Cancelled, but the server operation may still be running: <reason>`, where the reason is the driver error or `no answer within 5 s`.
  - **Cancel checks:** the three existing frontend cancel checks (`client.ts` twice, `export.svelte.ts`) use a case-sensitive `includes('cancelled')`, so they do not match this message. Each gets an explicit check for the prefix `Cancelled, but the server operation may still be running`, which also counts as a cancel.
  - **Client:** `QueryCancelledError` gains `serverWarning: string | null`. In `executeQuery` and `executeShell`, `client.ts` sets it to the IPC string when that string starts with `Cancelled, but the server operation may still be running`.
  - **Query store:** on a `QueryCancelledError` with a `serverWarning`, both the single-run and the Run All paths dispatch a `dgrid:notify` window event with `{ type: 'warning', message }`. This is the same pattern as `dgrid:connection-lost`, which avoids importing the app store. The app store listens for it and calls `notify`.
  - **Export store:** when the cancel string starts with the same prefix, it calls `appStore.notify('warning', message)` after resetting the state.
- **The export's inner function takes a progress callback.** `export_csv_inner` gets an `FnMut(ExportProgress)` callback in place of `&AppHandle`. The command passes one that emits `export-progress`, and the integration test passes one that records.
- **`export_csv_to_string` also uses a session.** It shares `open_cursor`, so it gets a session too. It has no token and so no kill.
- **Only on cancel.** A run that ends any other way (success, error, its future dropped at app exit) sends no kill. The shell spec's accepted app-quit risk stays.

## Boundaries

- Out of scope:
  - **Secondaries.** Operations running on secondaries under a non-primary read preference are not killed, because `killSessions` is sent to the primary.
  - **Connections the script opens itself.** A script's own `connect()` or `new Mongo()` connections do not carry the run's `appName`.
  - **`cancel_export` feedback.** No change to how `cancel_export` itself reports.
- Don't touch: frontend files other than `src/api/client.ts`, `src/stores/query.svelte.ts`, `src/stores/export.svelte.ts`, `src/stores/app.svelte.ts` and their tests. The commands `cancel_query` and `cancel_export` stay as they are.
- Stop and ask if: an `executor.rs` or export operation cannot take an explicit session; or a slow-operation test still stops without the kill, which would mean the server already interrupts it.

## Log

- 2026-11-16: Approved: Scott Schlesier, 2026-11-16: Kill server work on cancel for queries, exports and shell runs; wait up to 5 s; warn the user if the stop fails; backend sets the shell appName. Cold read: blocked on one question (shell appName: mongosh's URI parser only loads inside the repo), answered and folded in
- 2026-11-21: Started on branch feat/kill-server-op-on-cancel
- 2026-11-21: Boundary hit (stop and ask): on mongod 9.0.4 a slow read stops on its own when its client disconnects. The aggregation killop test passes with the kill disabled, and a mongosh client SIGKILLed mid-aggregate left no operation on the server. Writes do not stop (the write test fails without the kill: 2,292 -> 3,626 written). Query kill committed in the meantime; asking how to treat the read criteria (2, and the export criterion 3).
- 2026-11-21: Decision (Scott, 2026-11-21): keep killSessions for reads too; criteria 2 and the export 'no operation left' half are recorded as unprovable on mongod 9.0.4 (slow reads stop on disconnect), their tests kept but marked as not proving the kill. No spec change.
- 2026-11-21: Status: in-review
- 2026-11-21: Review round 1 triage: app.svelte.ts reformat hunks dismissed; main's copy already fails the repo's prettier, so the pre-commit hook reformats them whenever the file is touched. Fixed with tests: mongosh working directory, empty killSessions guard.
- 2026-11-21: Review round 1 triage (pass 1, run 2): dismissed 'cancel between mongosh statements': mongosh is killed before the stop, so nothing can start after it, and an idle session has no operation to stop. Fixed: export kill skipped when the inner token check won the race; tests for the dgrid:notify listener and the loadPage warn path. Open for Scott: servers without session support; a session whose kill failed returning to the pool.
- 2026-11-21: Review round 1 triage (pass 1, run 3): dismissed causal_consistency(false) untested (unobservable on a standalone server; the spec decides it), lsid dedup mutant (equivalent), partial CSV left on disk after a cancel (predates this change; not in scope), export progress event carrying the warning text before the store resets (cosmetic). No fixes this run.
