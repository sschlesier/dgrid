---
agent: "STOP: run `spx help --skill` and follow it before any work on this spec. Use spx for every store step; never edit the store by hand."
title: Run a shell script through mongosh from the backend
type: feature
priority: 2
depends-on: []
parent: shell-mode-that-runs-scripts-through-mongosh
approved: "Scott Schlesier, 2026-11-14: Approved after cold read; unserializable values report a placeholder; mongosh found on PATH only. Cold read: blocked on one question (unserializable values), answered and folded in"
status: in-review
---

The frontend can call an `execute_shell` Tauri command with a script and get back every result the script reported (as documents in dgrid's tagged format), the script's console output, and any script error.

## Context

First child of the Shell mode epic. This spec is backend plus the IPC contract and client wrapper; no UI. The script it receives is already instrumented by the frontend (see `wrap-top-level-script-expressions-to-report-results`): it calls `__dgrid.result(index, value)` for each value to report. The backend never parses JavaScript.

Reference for command shape and cancellation: `src-tauri/src/commands/query.rs`.

## Acceptance criteria

- [x] `execute_shell` with script `__dgrid.result(0, db.<coll>.find({}))` against a seeded collection returns one result with `kind: "cursor"` and the collection's documents, with ObjectId, Date and Long values in the same `{_type, _value}` form `execute_query` returns for them.
- [x] A script that reports three values returns three results in `index` order.
- [x] A reported scalar `6` comes back as one document `{ "value": 6 }` with `kind: "value"`; a reported plain object comes back as that one document; a reported array of scalars comes back as one `{ "value": … }` document per element.
- [x] A reported `undefined` produces no result.
- [x] A reported value that cannot be serialized comes back as one document `{ "value": "[not displayable: <type>]" }` with `kind: "value"`, and the script carries on: reporting `db.<coll>` (a shell object) gives `[not displayable: Collection]`, reporting a function gives `[not displayable: function]`, and a result reported on the next line is still returned.
- [x] A cursor with more than 1,000 documents returns exactly 1,000 and `truncated: true`. A reported array with more than 1,000 elements does the same.
- [x] A reported `null` comes back as one document `{ "value": null }`; a reported empty array comes back as a result with zero documents.
- [x] `print("hello")` in the script appears in `output`.
- [x] A script that prints, reports a result, then throws returns a normal (non-error) IPC response with `error.message` containing the thrown message, the output printed before the throw, and the result reported before the throw.
- [x] `db.getName()` inside the script equals the `database` in the request.
- [x] Calling `cancel_query` with the run's `tabId` while a script sleeps makes `execute_shell` fail with `DgridError::QueryCancelled`, and no `mongosh` child of the app is left running.
- [x] When `mongosh` cannot be found, `execute_shell` fails with `DgridError::QueryExecution` whose message contains "mongosh" and "PATH".
- [x] When the connection id is not connected, it fails with `DgridError::NotFound`.
- [x] While a run is in progress, the connection password does not appear in the `mongosh` process arguments (`ps -o args`), and no file in the run's temp directory contains it.
- [x] After a run ends (success, script error or cancel), its temp directory no longer exists.

## Verification

- `pnpm verify`
- `cargo test` in `src-tauri/` (unit tests: EJSON-to-tagged mapping for each `kind` and wrapping rule, output cap, argument building has no URI).
- `MONGODB_TEST_URI=mongodb://localhost:27017 cargo test -- --ignored shell` in `src-tauri/` with `mongosh` on `PATH`: integration tests for the criteria that need a real run (results, truncation, output, error, database, cancel, temp dir cleanup). They follow the existing `#[ignore]` + `MONGODB_TEST_URI` pattern in `src-tauri/src/pool.rs`, and each uses its own database, dropped afterwards.
- mongosh-missing criterion: an `#[ignore]` test that passes a program path that does not exist through the test seam (not `std::env::set_var`, which would race with the other tests in the same process). The `DGRID_MONGOSH_PATH` lookup itself has a unit test.
- Password criterion: an `#[ignore]` test against a URI with a made-up password (connection may fail; the check is on the spawned arguments and the temp directory contents, exposed through a test seam). On Unix, the sleeping-script integration test also reads `ps -o args= -p <pid>` for the child and asserts the URI is not in it.
- The `#[ignore]` tests are not run by `pnpm verify` or CI; their local output is the evidence for review. CI coverage of a real run arrives with the E2E spec in `shell-mode-in-query-tabs-with-per-statement-results`.

## Design

**Flags:** none. (No stored data, no config. A new IPC command is internal to the app.)

**Contract** (add to `src/lib/contracts.ts`, mirror in Rust with `camelCase` serde):

```ts
export interface ExecuteShellRequest {
  script: string;      // already instrumented
  database: string;
  tabId?: string;      // for cancellation
}
export interface ShellResult {
  index: number;                       // the index passed to __dgrid.result
  kind: 'cursor' | 'value';
  documents: Record<string, unknown>[]; // tagged format
  truncated: boolean;
}
export interface ShellError { message: string }
export interface ExecuteShellResponse {
  results: ShellResult[];
  output: string;        // stdout and stderr, merged in arrival order
  error?: ShellError;    // set when mongosh exits non-zero
  executionTimeMs: number;
}
```

Add `executeShell(connectionId, request)` to `src/api/client.ts` next to `executeQuery`, with the same error wrapping.

**Decisions:**

- **Files:** new `src-tauri/src/shell.rs` (spawn, collect, map), `src-tauri/src/shell_prelude.js` (embedded with `include_str!`), `src-tauri/src/commands/shell.rs` (thin handler). Register the command in `lib.rs`.
- **Invocation:** `mongosh --nodb --quiet --norc <tmp>/prelude.js <tmp>/script.js`, stdin null, stdout and stderr piped. Spawn with `tokio::process::Command` and `kill_on_drop(true)`. No shell is involved; no Tauri shell plugin.
- **Finding mongosh:** `DGRID_MONGOSH_PATH` if set (for tests), else the name `mongosh` resolved by the OS through `PATH`. A spawn error of kind NotFound maps to the "mongosh was not found on PATH. Install the MongoDB Shell to use Shell mode." message.
- **Environment passed to the child:** `DGRID_SHELL_URI` (the full URI, with credentials, as the pool holds it), `DGRID_SHELL_DB` (request database), `DGRID_SHELL_OUT` (result file path). Add a `get_uri(id)` accessor to `ConnectionPool`.
- **Prelude:** sets `db = connect(process.env.DGRID_SHELL_URI).getSiblingDB(process.env.DGRID_SHELL_DB)` and defines `globalThis.__dgrid.result(index, value)`:
  - a value with `hasNext` and `next` functions is a cursor: read up to 1,001 documents with `hasNext()`/`next()`, keep 1,000, set `truncated` if there was one more; `kind: "cursor"`. If `EJSON.stringify` throws for its documents, the string `[not displayable: <name>]` is reported instead with `kind: "value"`, `<name>` being the cursor's `constructor.name`, and the script carries on (decided 2026-11-15).
  - `undefined` is skipped.
  - an array is `kind: "value"`, cut to 1,000 elements with `truncated` set when it had more.
  - a function is reported as the string `[not displayable: function]`, `kind: "value"`; a symbol as `[not displayable: symbol]` (decided 2026-11-15).
  - anything else is `kind: "value"`. If `EJSON.stringify` throws for it, the string `[not displayable: <name>]` is reported instead, where `<name>` is the value's `constructor.name`, or `object` when it has none (decided 2026-11-14: a placeholder, not a silent skip and not a script abort).
  - each call appends one line `EJSON.stringify({ index, kind, truncated, value }, { relaxed: false })` to the result file.
- **Mapping:** parse each line as JSON, convert `value` with `Bson::try_from(serde_json::Value)` (canonical Extended JSON; bson 2.15), then to the tagged format with the existing `bson_ser` functions. A document becomes one document; an array becomes one document per element; any element or value that is not a document is wrapped as `{ "value": <it> }`.
- **Unreadable values** (decided 2026-11-15): when `Bson::try_from` rejects a reported value (mongosh emits `{"$date":{"$numberLong":"NaN"}}` for an invalid Date, and a user object such as `{ $oid: 5 }` only looks like Extended JSON), that value becomes the document `{ "value": "[not displayable: object]" }` and the rest of the run is returned. For an array or cursor, the conversion is per element, so only the unreadable element is replaced. A line that is not JSON, or has no `index` or `kind`, still fails the run with `DgridError::QueryExecution`.
- **No input validation** (decided 2026-11-15): an empty `database` or `script` is passed to mongosh as is; what mongosh reports comes back as data.
- **Script error is data, not an IPC error.** A non-zero exit sets `error.message` to the trimmed stderr text, or `mongosh exited with code <n>` when stderr is empty. Results and output collected so far are still returned.
- **Cancellation:** reuse `state.cancellation_tokens` and the existing `cancel_query` command, with the same `tokio::select!` shape as `execute_query`. Dropping the run kills the child.
- **Temp directory:** one per run under the OS temp dir, named `dgrid-shell-<uuid>`, mode `0700` on Unix, removed when the run ends on every path. It holds the prelude, the script and the result file.
- **Output cap:** `output` is cut at 1 MB with a final line `… output truncated`.
- **No timeout.** The user cancels, as with queries. A reported cursor that never ends (such as a change stream) blocks until cancelled.
- **Envelope parsing:** the whole line goes through `Bson::try_from`, since `index` arrives as `{"$numberInt": "0"}`. Results are returned sorted by `index`.
- **Other failures:** spawn errors other than NotFound, and temp directory or file write failures, map to `DgridError::QueryExecution` with the io message. A child killed by a signal sets `error.message` to the trimmed stderr, else `mongosh exited without an exit code`.
- **Output details:** stderr text appears in both `output` and `error.message`. Arrival order across the two pipes is best effort. The cap is 1,048,576 bytes, cut on a UTF-8 boundary, and the pipes keep draining after it.
- **Testable core:** the handler's logic lives in a `shell.rs` function that takes the pool, token and request, so tests don't need a Tauri `State`.
- **Windows, unverified:** `Command::new("mongosh")` is expected to find `mongosh.exe` but not an npm-installed `mongosh.cmd`; such installs would get the not-found message. Accepted under the epic's PATH-only decision.

## Boundaries

- Stop and ask if: `Bson::try_from` cannot parse what `EJSON.stringify(…, { relaxed: false })` emits for a type the existing tagged format supports; or passing the URI by environment variable turns out not to work on one of the three platforms.
- Don't touch: `executor.rs`, `execute_query`, the frontend beyond `contracts.ts` and `client.ts`.

## Log

- 2026-11-14: Approved: Scott Schlesier, 2026-11-14: Approved after cold read; unserializable values report a placeholder; mongosh found on PATH only. Cold read: blocked on one question (unserializable values), answered and folded in
- 2026-11-14: Started on branch feat/execute-shell
- 2026-11-14: Assumption: the 1 MB output cap counts the script's output; the '… output truncated' line is added after it. A result line that cannot be parsed fails the run with QueryExecution.
- 2026-11-14: Deviation: the mongosh-missing test is not #[ignore] (it spawns nothing, so it runs in pnpm verify). Cancel criterion is tested through the cancellation token at shell::run_script, not through the cancel_query command and a Tauri State.
- 2026-11-14: Evidence: pnpm verify passed; MONGODB_TEST_URI=mongodb://localhost:27017 cargo test -- --ignored shell passed 10/10 on macOS with mongosh 2.14.2. Windows and Linux not run.
- 2026-11-14: Status: in-review
- 2026-11-15: Review round 1 fixes: token registration/release extracted and tested, release keeps a newer run's token (74275b7); error message from the last 1 MB of stderr, tests for less common BSON types, zero-report script and ps with a password URI (d60672f).
- 2026-11-15: Dismissed (round 1): surviving mutant truncated unwrap_or(false) is equivalent, the prelude always writes the field. Unbounded results file: the frontend reports once per top-level statement and each result is cut at 1,000, same size exposure as execute_query. Multi-byte character split across interleaved pipe chunks: Design says arrival order across the two pipes is best effort. Shared cancelled-substring helper in client.ts: Design asks for the same error wrapping as executeQuery.
- 2026-11-15: Found in review: Bson::try_from rejects what mongosh emits for an invalid Date ({"$date":{"$numberLong":"NaN"}}) and for a user object whose keys look like Extended JSON ({$oid: 5}); such a line currently fails the whole run. This is the Boundaries stop-and-ask case; waiting for a decision.
- 2026-11-15: Amended: Review round 1 decisions by Scott Schlesier: unreadable values and unserializable cursor items report a placeholder, symbols keep their placeholder, no input validation
- 2026-11-15: Accepted risks (Scott Schlesier, review round 1): (1) quitting dgrid mid-run may leave mongosh running and its dgrid-shell-<uuid> folder on disk, to be handled with the Shell mode UI spec; (2) a script that starts a detached process holding stdout/stderr makes the run wait until cancelled; (3) Windows and Linux were not run, a real run on Linux comes with the Shell mode E2E spec, Windows stays unverified. Spot check: clearing the same-user visibility of DGRID_SHELL_URI was confirmed right.
