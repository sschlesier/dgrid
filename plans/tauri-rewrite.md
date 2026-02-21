# DGrid: Tauri v2 + Rust Backend Rewrite

## Context

DGrid currently ships as a Node.js SEA with a Fastify backend and Svelte 5 frontend served over localhost. Migrating to Tauri v2 with a Rust backend eliminates the Node.js runtime, HTTP server, and custom build pipeline. The frontend loads in the OS webview, backend logic runs via direct IPC, and Tauri's bundler produces signed native installers. Bundle size drops from ~50MB to ~10MB, RAM usage from ~200MB to ~50MB. The system tray is not needed — the app runs as a normal window application.

## Scope

**Replace**: `src/backend/` (~4,700 lines TypeScript), build scripts, SEA pipeline
**Remove**: systray (not needed — app runs as a normal window)
**Keep**: `src/frontend/` (Svelte 5), `src/shared/contracts.ts`, E2E test structure
**Move to shared**: `src/backend/db/queries.ts` → `src/shared/queries.ts` (parser stays in TypeScript)
**Modify**: `src/frontend/src/api/client.ts` (fetch → invoke), `src/frontend/src/api/websocket.ts` (WebSocket → Tauri events)

## Key Design Decisions

1. **No HTTP server** — Tauri IPC replaces all REST endpoints. No CORS, no rate limiting, no network exposure.
2. **Frontend-side parser** — The query parser stays in TypeScript, moved to `src/shared/`. The frontend parses mongo shell syntax into a structured `ParsedQuery` object and sends it to Rust via IPC. Tauri IPC is in-process (not a network boundary), so there's no security reason to re-parse server-side. This eliminates the riskiest part of the port (1,520 lines of regex-based parsing).
3. **CSV export via file write + events** — Tauri save dialog → Rust writes CSV to file → emits progress events. Replaces HTTP chunked streaming.
4. **Query cancellation via tokens** — `tokio_util::CancellationToken` keyed by tab ID, triggered by a `cancel_query` command.
5. **File watching via Tauri events** — `notify` crate + `app.emit("file-changed", ...)` replaces WebSocket.
6. **Manual type sync** — Rust structs mirror `contracts.ts` interfaces. At ~15 interfaces, codegen isn't worth it.

## Project Structure

```
dgrid/
  src-tauri/                        # Tauri v2 Rust backend
    Cargo.toml
    tauri.conf.json
    src/
      main.rs
      lib.rs                        # Command registration
      commands/                     # Tauri command handlers (thin layer)
        connections.rs              # Connection CRUD + test/connect/disconnect
        databases.rs                # Database/collection browsing + schema
        query.rs                    # Query execution + cancellation
        version.rs                  # Version command
      pool.rs                       # Connection pool
      executor.rs                   # Query execution against driver
      bson_ser.rs                   # BSON ↔ JSON tagged serialization
      storage.rs                    # JSON file CRUD (~/.dgrid/connections.json)
      keyring.rs                    # OS keyring via `keyring` crate
      credentials.rs                # URI credential strip/inject
      error.rs                      # Unified error enum
      state.rs                      # AppState (managed state)
  src/shared/
    contracts.ts                    # Type source of truth (both sides)
    queries.ts                      # Query parser (moved from backend)
    querySplitter.ts                # Query splitting logic
  src/frontend/                     # Svelte 5 UI (unchanged except api/)
```

## Agent Workflow

**Keep this plan updated.** When you complete a phase (or a significant chunk of one), update the status markers below. Mark phases `[x]` when done, add notes about what was built, and note any deviations from the original plan. Future agents should be able to read this file and immediately know what's done and what's next.

**Before starting each phase**, the agent must explore the relevant existing code and plan its approach. Break the phase into logical steps and commit each step independently with a clear commit message.

**TDD porting loop** for each Rust module:

1. Read the existing TypeScript implementation and its tests
2. Write equivalent Rust tests (`#[cfg(test)]`) that assert the same behavior
3. Implement the Rust code until all tests pass
4. Wire up as a Tauri command, verify end-to-end
5. Commit

The existing TypeScript tests are the specification. The existing TypeScript code is the reference implementation. Use `cargo test` continuously. Each logical unit of work (a module, a command group, a wiring change) should be its own commit.

## API Surface

Every REST endpoint becomes a Tauri command. The full mapping is in `src/backend/routes/`. Key groups:

- **Connections**: CRUD, test, connect/disconnect (`routes/connections.ts`)
- **Databases**: list databases, collections, stats, schema (`routes/databases.ts`)
- **Query execution**: receives pre-parsed `ParsedQuery` from frontend (`routes/query.ts`)
- **Documents**: field update, document delete (`routes/documents.ts`)
- **CSV export**: write to file with progress events (`routes/export.ts`)
- **Files**: read, write, watch, unwatch (`routes/files.ts`)
- **Version**: version + update check (`routes/version.ts`)

## Phased Implementation

### Phase 1: Scaffold — [x] COMPLETE

Set up Tauri v2 in the project. Configure `tauri.conf.json` to serve the existing Svelte frontend. Define `AppState` and `DgridError`. Register a `get_version` placeholder command. Verify `cargo tauri dev` opens a window showing the Svelte UI.

**Done (commit `158a4a2`):**

- `src-tauri/` created with Cargo.toml (tauri 2, serde, thiserror, tokio), build.rs, tauri.conf.json
- `tauri.conf.json` points dev URL at `http://localhost:5173`, build output at `dist/frontend`
- `AppState` placeholder in `state.rs`, `DgridError` enum in `error.rs` with `Serialize` impl
- `get_version` command in `commands/version.rs` returning `CARGO_PKG_VERSION`
- Default capabilities (`core:default`), app icons generated from `assets/dgrid.icns`
- 3 Rust tests passing (error serialization, error display, version command)
- `.gitignore` updated for `src-tauri/target/` and `src-tauri/gen/`

### Phase 2: Connection Storage + Connectivity — [x] COMPLETE

Port connection storage (JSON file CRUD with atomic writes), keyring integration, and credential handling. Then add the MongoDB connection pool and database browsing commands. Wire up `client.ts` to use `invoke()` instead of `fetch()`.

Verify: connection dialog CRUD works, can connect to MongoDB, sidebar tree populates.

**Done:**

- `error.rs` — expanded DgridError with Storage, Keyring, Connection, Database, NotFound, Validation variants + From impls
- `credentials.rs` — strip_credentials, inject_credentials, get_database_from_uri (percent-encoding, SRV support)
- `storage.rs` — ConnectionStorage with JSON file CRUD, atomic writes (temp+rename), old-format detection, UUID/timestamps
- `keyring.rs` — PasswordStorage trait, KeyringPasswordStorage (service "dgrid-mongodb-gui"), MockPasswordStorage for tests
- `pool.rs` — ConnectionPool with RwLock<HashMap>, connect/disconnect/force_disconnect/get_client/get_db
- `state.rs` — AppState wiring (storage + passwords + pool), data dir ~/.dgrid
- `commands/connections.rs` — list, get, create, update, delete, test, test_saved, connect, disconnect
- `commands/databases.rs` — get_databases, get_collections, get_collection_stats, get_schema (with flatten_document_keys/collect_columns)
- `client.ts` — migrated to invoke() for all connection/database/version endpoints; fetch() kept for Phase 3+ endpoints
- 64 Rust tests passing (10 error, 16 credentials, 18 storage, 7 keyring, 7 pool, 6 database helpers)

### Phase 3: Query Execution — [x] COMPLETE

Move the parser from `src/backend/db/queries.ts` to `src/shared/queries.ts`, stripping out the executor (which had the `mongodb` driver dependency). The parser is pure string manipulation — no backend imports.

Update `client.ts` so `executeQuery()` calls `parseQuery()` on the frontend, then sends the resulting `ParsedQuery` struct to Rust via `invoke()`. Parse errors are caught before IPC.

Build the Rust executor: define serde structs matching `ParsedCollectionQuery` / `ParsedDbCommand`, match on the operation enum, dispatch to the MongoDB Rust driver. Add BSON serialization (type-tagged `{ _type, _value }` format).

Verify: run queries from the UI, see results in the grid, pagination works.

**Done:**

- `src/shared/queries.ts` — parser extracted from backend, uses `Record<string, unknown>` instead of MongoDB `Document` type
- `src/backend/db/queries.ts` — re-exports parser from shared, keeps executor code with `as Document` casts
- `src/shared/__tests__/queries.test.ts` — 111 parser tests moved from backend
- `src-tauri/src/bson_ser.rs` — BSON ↔ JSON with 6 tagged types (ObjectId, Date, Binary, Decimal128, Long, UUID), json_to_bson reverse conversion, 20 unit tests
- `src-tauri/src/executor.rs` — full query executor: 18 collection operations (find, aggregate, count, distinct, insert, update, delete, findOneAnd\*, index, bulkWrite), 14 db commands (stats, serverStatus, createCollection, etc.), pagination logic, 72 deserialization/unit tests
- `src-tauri/src/commands/query.rs` — execute_query and cancel_query Tauri commands with CancellationToken + tokio::select!
- `src-tauri/src/state.rs` — added cancellation_tokens HashMap
- `src/frontend/src/api/client.ts` — parseQuery() on frontend, invoke('execute_query') with parsed query, cancelQuery via invoke
- `src/frontend/src/stores/query.svelte.ts` — replaced AbortController pattern with runningTabs Set + api.cancelQuery()
- API client tests updated: mock invoke for Tauri endpoints, mock fetch for remaining endpoints (exportCsv, files)
- 92 Rust tests, 716 TypeScript tests all passing

### Phase 4: Document Operations + CSV Export — [x] COMPLETE

Port document field updates and deletes. Port CSV utilities (flatten, collect columns, escape, build rows). CSV export uses the Tauri dialog plugin for the save picker, writes directly to file in Rust, and emits progress events.

Verify: edit field values, delete documents, export CSV with progress bar.

**Done:**

- `src-tauri/src/commands/documents.rs` — update_field and delete_document Tauri commands with tagged BSON deserialization for document IDs and values
- `src-tauri/src/csv.rs` — flatten_document, escape_csv_field, collect_columns, build_csv_row ported from TypeScript, handling all BSON special types (ObjectId, DateTime, UUID, Binary, Decimal128, Int64)
- `src-tauri/src/commands/export.rs` — export_csv and cancel_export commands; writes CSV directly to file with CancellationToken support, emits export-progress events for real-time progress
- `tauri-plugin-dialog` added for native save dialog, capabilities updated with `dialog:default`
- `src/frontend/src/api/client.ts` — updateField/deleteDocument migrated to invoke(); exportCsv removed
- `src/frontend/src/stores/export.svelte.ts` — rewritten to use Tauri save dialog, invoke('export_csv'), and listen('export-progress') events
- `@tauri-apps/plugin-dialog` added to frontend dependencies
- 138 Rust tests, 715 TypeScript tests all passing

### Phase 5: File Operations — [x] COMPLETE

Port file read/write with path validation. Add file watching via the `notify` crate, emitting Tauri events. Replace `websocket.ts` with a Tauri event listener wrapper.

**Done:**

- `src-tauri/src/file_validation.rs` — is_path_safe and is_allowed_extension ported from TypeScript, matching same blocked patterns, temp dir allowlist, and extension rules; 9 unit tests
- `src-tauri/src/commands/files.rs` — read_file, write_file, watch_file, unwatch_file Tauri commands with path validation, size limits (1MB), parent directory creation; 11 unit tests
- `src-tauri/src/state.rs` — added file_watchers HashMap<String, RecommendedWatcher> to AppState
- `notify` crate added to Cargo.toml for filesystem watching; watch_file emits `file-changed` Tauri events with path and content on file modification
- `src/frontend/src/api/client.ts` — readFile/writeFile migrated to invoke(); removed all fetch infrastructure (request, parseApiError, handleResponse, API_BASE) as no fetch-based endpoints remain
- `src/frontend/src/api/websocket.ts` — completely rewritten from WebSocket to Tauri events; uses listen('file-changed') + invoke('watch_file'/'unwatch_file'); no reconnection logic needed (IPC is in-process)
- `src/frontend/src/__tests__/websocket.test.ts` — rewritten for Tauri event API; mocks @tauri-apps/api/core and @tauri-apps/api/event; 15 tests
- `src/frontend/src/__tests__/api-client.test.ts` — file tests migrated from mockFetch to mockInvoke; fetch-based error handling tests removed; 28 tests
- 158 Rust tests, 714 TypeScript tests all passing

### Phase 6: Packaging — [x] COMPLETE

Add update checker. Set up `tauri.conf.json` bundle targets for macOS (.dmg), Windows (.nsis), Linux (.deb + .AppImage). Update the GitHub Actions release workflow. No system tray — app runs as a normal window application.

**Done:**

- `src-tauri/src/updater.rs` — update checker module: fetches latest release from GitHub API (`sschlesier/dgrid`), semantic version comparison (`is_newer`), returns `Option<UpdateInfo>` with version and URL; 10 unit tests
- `src-tauri/src/commands/version.rs` — added `check_for_updates` Tauri command with 1-hour cache (via `AppState.update_cache`); returns `VersionResponse { version, update? }` matching the shared contract; 3 unit tests (version string, serialization with/without update)
- `src-tauri/src/state.rs` — added `CachedUpdateCheck` struct and `update_cache: RwLock<Option<CachedUpdateCheck>>` to AppState
- `reqwest` crate added to Cargo.toml for HTTP requests to GitHub API
- `src/frontend/src/api/client.ts` — added `checkForUpdates()` function invoking `check_for_updates` command
- `src/frontend/src/stores/app.svelte.ts` — `checkForUpdates()` now calls `api.checkForUpdates()` instead of `api.getVersion()`
- `src-tauri/tauri.conf.json` — bundle targets configured: app, dmg (macOS), nsis (Windows), deb + appimage (Linux); added category, descriptions, platform-specific sections
- `.github/workflows/release.yml` — replaced SEA build pipeline with Tauri bundler; added macOS (macos-14), Windows, and Linux (ubuntu-22.04) build jobs with Rust toolchain, caching, and `pnpm tauri build`; artifacts uploaded as dmg/exe/deb/AppImage with SHA256 checksums; Homebrew cask update preserved
- `@tauri-apps/cli` added to devDependencies; `tauri` script added to package.json
- 170 Rust tests, 717 TypeScript tests all passing

### Phase 7: Cleanup — [x] COMPLETE

Delete `src/backend/`, build scripts, SEA pipeline, and unused npm dependencies. Update `CLAUDE.md` and project documentation.

**Done:**

- `src/backend/` deleted (~4,700 lines of TypeScript)
- `scripts/build-sea.ts`, `scripts/bundle.ts`, `scripts/smoke-test-bundle.sh`, `scripts/copy-native.ts` deleted
- `scripts/release.ts` rewritten to use `pnpm tauri build` instead of SEA pipeline
- `package.json` — removed backend scripts (dev:backend, build:backend, bundle, sea:build, smoke-test, start), updated dev/build/type-check/verify; removed Fastify deps (@fastify/cors, @fastify/helmet, @fastify/rate-limit, @fastify/websocket), removed backend deps (fastify, pino, chokidar, systray2, @napi-rs/keyring), removed build deps (concurrently, esbuild, pino-pretty); moved mongodb to devDependencies (still needed by E2E fixtures)
- `tsconfig.json` — removed `src/backend` from excludes
- `vite.config.ts` — removed `/api` proxy (frontend uses IPC, not HTTP)
- `CLAUDE.md` — rewritten for Tauri architecture (project structure, dev stack, commands, architecture patterns, security)
- `.claude/rules/api-design.md` — rewritten from REST patterns to Tauri IPC commands
- `playwright.config.ts` — removed old backend webServer entry; MongoDB startup moved to globalSetup
- `tests/e2e/global-setup.ts` — now starts mongodb-memory-server directly
- `tests/e2e/global-teardown.ts` — stops MongoDB and cleans up temp dir
- `tests/e2e/run-backend-e2e.js` — deleted (MongoDB handled by globalSetup)
- `tests/e2e/fixtures.ts` — `deleteAllConnections()` rewritten as file-based cleanup (was REST API); removed `request`/`API_BASE` refs
- E2E spec files — updated `deleteAllConnections(request)` → `deleteAllConnections()` across all 13 specs
- `tests/e2e/specs/smoke.spec.ts` — replaced backend health check with app-loads test
- 170 Rust tests, 500 TypeScript tests all passing; lint and type-check clean
- **Note:** E2E tests need Tauri integration to run (frontend uses `invoke()` which requires Tauri runtime; Playwright cannot control the native webview directly)

## Risks

| Risk                                                                 | Mitigation                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **ParsedQuery type drift** (Rust structs diverge from TS interfaces) | Rust tests that deserialize JSON fixtures exported from TypeScript parser tests |
| **MongoDB Rust driver API differences**                              | Read docs per operation. Most map 1:1. Official driver is mature                |
| **Tauri cross-platform quirks** (WebKit on macOS/Linux)              | Test on all platforms early in Phase 6                                          |

## Reference

- Tauri v2: https://v2.tauri.app/
- MongoDB Rust driver: https://docs.rs/mongodb
- BSON: https://docs.rs/bson
- Serde: https://serde.rs/
- Keyring: https://docs.rs/keyring
- Notify: https://docs.rs/notify
- Thiserror: https://docs.rs/thiserror
- Tokio: https://tokio.rs/tokio/tutorial
