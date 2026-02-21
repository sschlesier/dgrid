# DGrid: Tauri v2 + Rust Backend Rewrite

## Context

DGrid currently ships as a Node.js SEA with a Fastify backend, systray integration, and Svelte 5 frontend served over localhost. Migrating to Tauri v2 with a Rust backend eliminates the Node.js runtime, HTTP server, and custom build pipeline. The frontend loads in the OS webview, backend logic runs via direct IPC, and Tauri's bundler produces signed native installers. Bundle size drops from ~50MB to ~10MB, RAM usage from ~200MB to ~50MB.

## Scope

**Replace**: `src/backend/` (~4,700 lines TypeScript), build scripts, SEA pipeline, systray2
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
      db/
        pool.rs                     # Connection pool
        executor.rs                 # Query execution against driver
        bson_ser.rs                 # BSON ↔ JSON tagged serialization
        csv.rs                      # CSV flattening/escaping
      storage/
        connections.rs              # JSON file CRUD (~/.dgrid/connections.json)
        keyring.rs                  # OS keyring via `keyring` crate
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

### Phase 1: Scaffold

Set up Tauri v2 in the project. Configure `tauri.conf.json` to serve the existing Svelte frontend. Define `AppState` and `DgridError`. Register a `get_version` placeholder command. Verify `cargo tauri dev` opens a window showing the Svelte UI.

### Phase 2: Connection Storage + Connectivity

Port connection storage (JSON file CRUD with atomic writes), keyring integration, and credential handling. Then add the MongoDB connection pool and database browsing commands. Wire up `client.ts` to use `invoke()` instead of `fetch()`.

Verify: connection dialog CRUD works, can connect to MongoDB, sidebar tree populates.

### Phase 3: Query Execution

Move the parser from `src/backend/db/queries.ts` to `src/shared/queries.ts`, stripping out the executor (which had the `mongodb` driver dependency). The parser is pure string manipulation — no backend imports.

Update `client.ts` so `executeQuery()` calls `parseQuery()` on the frontend, then sends the resulting `ParsedQuery` struct to Rust via `invoke()`. Parse errors are caught before IPC.

Build the Rust executor: define serde structs matching `ParsedCollectionQuery` / `ParsedDbCommand`, match on the operation enum, dispatch to the MongoDB Rust driver. Add BSON serialization (type-tagged `{ _type, _value }` format).

Verify: run queries from the UI, see results in the grid, pagination works.

### Phase 4: Document Operations + CSV Export

Port document field updates and deletes. Port CSV utilities (flatten, collect columns, escape, build rows). CSV export uses the Tauri dialog plugin for the save picker, writes directly to file in Rust, and emits progress events.

Verify: edit field values, delete documents, export CSV with progress bar.

### Phase 5: File Operations

Port file read/write with path validation. Add file watching via the `notify` crate, emitting Tauri events. Replace `websocket.ts` with a Tauri event listener wrapper.

### Phase 6: System Tray + Packaging

Configure Tauri tray (menu, icon, click behavior). Add update checker. Set up `tauri.conf.json` bundle targets for macOS (.dmg), Windows (.msi), Linux (.deb + .AppImage). Update the GitHub Actions release workflow.

### Phase 7: Cleanup

Delete `src/backend/`, build scripts, SEA pipeline, and unused npm dependencies. Update `CLAUDE.md` and project documentation. Verify the full E2E suite passes against the Tauri app.

## Risks

| Risk | Mitigation |
|---|---|
| **ParsedQuery type drift** (Rust structs diverge from TS interfaces) | Rust tests that deserialize JSON fixtures exported from TypeScript parser tests |
| **MongoDB Rust driver API differences** | Read docs per operation. Most map 1:1. Official driver is mature |
| **Tauri cross-platform quirks** (WebKit on macOS/Linux) | Test on all platforms early in Phase 6 |

## Reference

- Tauri v2: https://v2.tauri.app/
- MongoDB Rust driver: https://docs.rs/mongodb
- BSON: https://docs.rs/bson
- Serde: https://serde.rs/
- Keyring: https://docs.rs/keyring
- Notify: https://docs.rs/notify
- Thiserror: https://docs.rs/thiserror
- Tokio: https://tokio.rs/tokio/tutorial
