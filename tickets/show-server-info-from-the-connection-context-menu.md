---
agent: "STOP: run `spx help --skill` and follow it before any work on this spec. Use spx for every store step; never edit the store by hand."
title: Show server info from the connection context menu
type: feature
priority: P2
depends-on: []
parent:
approved: "Scott Schlesier, 2026-11-16: Server Info dialog from the connection context menu: version first, then build, runtime and topology sections. Cold read: pass: no blocking gaps"
status: done
---

Right-clicking a connected server in the sidebar offers "Server Info", which opens a dialog showing the MongoDB version prominently and the other standard server details MongoDB reports.

## Context

The sidebar context menu for a connection node (`getContextMenuItems`, `src/components/Sidebar.svelte`) offers Refresh, Edit Connection, Disconnect and Delete Connection. There is no way to see which MongoDB version or build a connection points at. Backend commands live in `src-tauri/src/commands/` and run admin commands through `state.pool.get_client(&id)` (see `get_databases`).

## Acceptance criteria

- [x] Right-clicking a connected connection node shows a "Server Info" item, placed after "Refresh".
- [x] Right-clicking a disconnected connection node does not show "Server Info".
- [x] Choosing "Server Info" opens a modal dialog titled with the connection name. It shows a loading state until the data arrives.
- [x] The dialog shows the server version first and largest (for example `7.0.5`), above the other sections.
- [x] The dialog shows, in labelled sections, these fields when the server reports them:
  - Build (`buildInfo`): version, gitVersion, modules, allocator, javascriptEngine, bits, debug, maxBsonObjectSize, storageEngines, openssl, buildEnvironment target info.
  - Runtime (`serverStatus`): host, process, pid, uptime (formatted as days/hours/minutes), localTime, storageEngine name, current/available connections.
  - Topology (`hello`): replica set name, isWritablePrimary, primary, hosts, maxWireVersion, minWireVersion, maxMessageSizeBytes, maxWriteBatchSize, logicalSessionTimeoutMinutes.
- [x] A section whose command fails (for example `serverStatus` denied to a limited user) shows "Unavailable" with the server's error message; the other sections still render.
- [x] If every command fails, the dialog shows the error and no empty sections.
- [x] The dialog closes on Escape, on overlay click and on its Close button.
- [x] A Rust unit test covers building the response from sample `buildInfo`/`serverStatus`/`hello` documents, including a missing field and a failed section.
- [x] An E2E test connects to the test MongoDB, opens Server Info from the context menu and sees the server's version.

## Verification

- `pnpm verify`
- `cargo test` in `src-tauri/`
- `node scripts/run-tauri-e2e.mjs --spec tests/webdriver/specs/sidebar-context-menu.e2e.mjs` — the new test asserts the dialog contains the version reported by the test server (read through the MongoDB driver in the test, via a helper in `runtime.mjs`).
- Manual under `pnpm dev`: connect to a server, right-click it, choose Server Info, and compare the version with `db.version()` in the query tab. Expect the same string. Right-click a disconnected connection: no "Server Info" item.

## Design

- **Backend command:** `get_server_info(id) -> ServerInfoResponse` in a new `src-tauri/src/commands/server.rs`, registered in `lib.rs`; wrapper `getServerInfo(connectionId)` in `src/api/client.ts`; types in `src/lib/contracts.ts`. Unknown connection id returns `DgridError::NotFound`, as other commands do.
- **Response shape:** three optional sections `build`, `runtime`, `topology`, each `{ data } | { error }`, where `data` is a flat map of the whitelisted fields above converted with the existing BSON tagged-JSON serializer (`bson_ser.rs`). Fields the server omits are left out, not shown as blank.
- **Commands run (all read-only):** `buildInfo`, `serverStatus` with all optional sections excluded (`{ serverStatus: 1, repl: 0, metrics: 0, locks: 0, wiredTiger: 0, ... }` as needed to keep the call cheap) and `hello`, each against the `admin` database, run concurrently. The app writes nothing to MongoDB.
- **Whitelist, not dump:** only the fields listed in the criteria are shown. Dumping the full `serverStatus` is out.
- **UI:** new `src/components/ServerInfoDialog.svelte`, modelled on `ConfirmDialog.svelte` (overlay, Escape, click-outside). Opened from Sidebar state, like the existing context menu. Fetched on open; no caching, no refresh button.
- **Selectors:** add a `serverInfoDialog` group to `tests/webdriver/selectors.mjs` (dialog, version, close button); extend `sidebar-context-menu.e2e.mjs` rather than adding a spec.
- No data migration, public API or config change. New Tauri command is internal IPC only.

## Boundaries

- Don't touch: stored formats (`connections.json`, localStorage keys).
- Stop and ask if: a field in the criteria needs a command that can write or take a lock.

## Log

- 2026-11-16: Approved: Scott Schlesier, 2026-11-16: Server Info dialog from the connection context menu: version first, then build, runtime and topology sections. Cold read: pass: no blocking gaps
- 2026-11-21: Started on branch feat/show-server-info-from-the-connection-context-menu
- 2026-11-21: Implemented; pnpm verify, cargo test and the sidebar-context-menu E2E spec pass. Not covered by an automated UI test: partial-section 'Unavailable', all-failed state, Escape/overlay close, manual db.version() comparison.
- 2026-11-21: Status: in-review
- 2026-11-21: Review round 1: added component tests (loading, Unavailable, all-failed, Escape/overlay/Close) and formatter tests; E2E now asserts no Unavailable section against the test server.
- 2026-11-21: Review round 1: dismissed missing get_server_info NotFound/integration test (same pattern as get_databases, no test there either); dismissed Escape reaching other window handlers (same pattern as ConfirmDialog).
- 2026-11-21: Review round 1 decisions (Scott): keep blank rows for empty values; buildEnvironment shows target_os and target_arch only; all-failed shows every distinct error; no timeout on the commands (accepted risk); version not repeated in Build. Note: first E2E test of a cold run can flake on the New Connection dialog (existing createConnection helper, not this change).
- 2026-11-21: Status: done: Reviewed round 1: criteria verified by Rust, Vitest component and E2E tests; open decisions answered; manual db.version() check not run
