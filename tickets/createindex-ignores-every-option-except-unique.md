---
title: createIndex ignores every option except unique
type: bug
priority: 2
approved: 'Scott Schlesier, 2026-10-10: approved after refine; unknown option keys rejected, E2E included. Cold read: not run'
status: done
---

Users who run createIndex in the query editor get an index built with every option they passed (TTL, name, sparse, partial filter, collation, hidden and the rest), or an error saying which option was wrong, instead of an index silently missing them.

Context: the executor's CreateIndex branch (`src-tauri/src/executor.rs`, `CollectionOperation::CreateIndex`) builds `IndexOptions` from `unique` only and silently drops everything else. The query succeeds and returns the index name, so users don't find out the options were lost. Found while manually verifying dgr-h2e: the created index had no TTL. The frontend parser (`src/lib/queries.ts`, `case 'createIndex'`) already passes the second argument through as `options`; only the backend drops it.

Out of scope:

- `IndexInfo.expire_after_seconds` serialization (`src-tauri/src/commands/databases.rs`). The contract (`src/lib/contracts.ts`) already declares `expireAfterSeconds?: number | null` and `IndexTooltip` handles `null`, so they agree; no change.
- `createIndexes` (plural), and create-level options that aren't index options (`commitQuorum`, `maxTimeMS`, write concern).
- The other operations that read only some of their options (`parse_update_options`, find's collation handling).
- Any UI change. The result stays `{ indexName }`.

## Steps to reproduce

1. `pnpm dev`, connect to any MongoDB, open a collection.
2. Run `db.c.createIndex({createdAt: 1}, {expireAfterSeconds: 3600, name: "ttl_created"})`.
3. Run `db.c.getIndexes()`.

Expected: an index named `ttl_created` with `expireAfterSeconds: 3600`.
Actual: an index named `createdAt_1` with no `expireAfterSeconds`.

## Acceptance criteria

- [ ] `createIndex(keys, opts)` creates the index with every option in `opts` that the driver's `IndexOptions` supports: `expireAfterSeconds`, `name`, `unique`, `sparse`, `partialFilterExpression`, `collation`, `hidden`, `weights`, `default_language`, `language_override`, `textIndexVersion`, `2dsphereIndexVersion`, `bits`, `min`, `max`, `bucketSize`, `wildcardProjection`, `storageEngine`, `v`.
- [ ] The result's `indexName` is the created index's name, including a custom `name`.
- [ ] An options key `IndexOptions` doesn't support (e.g. a typo `expireAfterSecond`) makes the query fail with an error that names the key, and no index is created.
- [ ] An option with a value of the wrong type (e.g. `expireAfterSeconds: "abc"`, `sparse: "yes"`) makes the query fail with an error naming the option, and no index is created.
- [ ] `createIndex(keys)` with no options and `createIndex(keys, {unique: true})` behave as today.

## Verification

- `pnpm verify` and `cargo test` in `src-tauri/`.
- Rust unit tests in `executor.rs` for the extracted options parser: one test per criterion above (all listed options map to the right fields, unknown key error, wrong type error, no options gives defaults).
- E2E: extend `tests/webdriver/specs/advanced-query-execution.e2e.mjs` with a test that runs `createIndex({createdAt: 1}, {expireAfterSeconds: 3600, name: "ttl_created", sparse: true})`, then `getIndexes()`, and asserts the results show `ttl_created` with `expireAfterSeconds` 3600 and `sparse` true. Run with `node scripts/run-tauri-e2e.mjs --spec tests/webdriver/specs/advanced-query-execution.e2e.mjs`.
- Manual (`pnpm dev`): the steps to reproduce above give the expected result, and the sidebar index tooltip for `ttl_created` shows the TTL.

## Design

- **Mapping:** convert `options` to a BSON document with `bson_ser::json_to_document` (so tagged BSON values in `partialFilterExpression` survive) and deserialize it into `mongodb::options::IndexOptions` with `bson::from_document`. The driver's serde attributes already handle the camelCase names, `expireAfterSeconds` as seconds, and `v` / `textIndexVersion` / `2dsphereIndexVersion`. No hand-written per-field mapping.
- **Unknown keys:** rejected before deserializing, by checking keys against a fixed list of the `IndexOptions` serde names (the list in the first criterion, plus `background`). Serde ignores unknown keys, so without this check a typo would be dropped silently, which is the bug this spec fixes. `background` is accepted and has no effect (the driver deprecated it; servers ignore it), matching mongosh.
- **Errors:** both unknown-key and deserialize errors go through the existing `Result<_, String>` path and show like any other query error. Message shape: `createIndex: unknown option 'expireAfterSecond'` and `createIndex: invalid value for option '<key>': <serde message>`.
- **Structure:** extract the parsing into a function next to `parse_update_options` (e.g. `parse_index_options(&Option<Value>) -> Result<IndexOptions, String>`) so it can be unit-tested without a MongoDB server; the Rust suite has no database.
- **Flags:** none. The `options` field of the IPC request is unchanged; this changes only how the backend reads it.

## Steps

1. Add `parse_index_options` to `src-tauri/src/executor.rs` with the key check and `bson::from_document`, and unit tests for it.
2. Use it in the `CollectionOperation::CreateIndex` branch in place of the `unique`-only code.
3. Add the E2E test to `advanced-query-execution.e2e.mjs` (selectors via `s`, per `.claude/rules/e2e-testing.md`).

## Boundaries

Stop and ask if: deserializing into `IndexOptions` can't express an option a user passes in mongosh in a way that needs a hand-written mapping, or the driver version in `Cargo.toml` would have to change.

## Log

- 2026-09-27: Migrated from tk dgr-cuuy (created 2026-09-27T00:30:55Z).
- 2026-09-30: Imported from br as dgr-wy2.
- 2026-10-10: Refined with spec-review: added outcome, criteria, verification, design and steps; scoped the `expire_after_seconds` note out (contract already allows `null`).
- 2026-10-10: Approved: Scott Schlesier, 2026-10-10: approved after refine; unknown option keys rejected, E2E included. Cold read: not run
- 2026-10-10: Started on branch fix/createindex-options
- 2026-10-10: Scope addition (approved by Scott in session): getIndexes also dropped every option except name/unique, so the E2E check couldn't see TTL or sparse. Fixed it to serialize the full IndexOptions (commit abf3605).
- 2026-10-10: Done: createIndex parses its options into the driver's IndexOptions, rejecting unknown keys and naming the option on a type error; getIndexes shows every index option. Covered by parser and serializer unit tests and the advanced-query-execution E2E test. Manual `pnpm dev` check not run.
