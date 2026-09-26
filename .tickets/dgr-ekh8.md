---
id: dgr-ekh8
status: open
deps: []
links: []
created: 2026-09-26T23:20:22Z
type: feature
priority: 2
assignee: Scott Schlesier
tags: [stage:refined]
---

# Create and drop collection indexes from the sidebar

Users can create a new index on a collection and drop an existing index from the sidebar
without writing shell commands.

Context: the sidebar lists a collection's indexes under an "Indexes" group, with a hover
tooltip for each (`IndexTooltip.svelte`), but managing indexes means typing
`db.coll.createIndex(...)` in the query editor, and that path only supports `unique`.
Inspired by Studio 3T's Index Manager, but deliberately smaller.

Out of scope:

- Editing an existing index (drop + recreate, or `collMod`); possible follow-up ticket
- Options beyond name / unique / sparse / TTL: partial filter, collation, hidden,
  wildcard projection, text weights, background
- A key builder with field pickers or autocomplete (keys are typed as an object)
- Index management for views
- Changing the query-editor `createIndex` / `dropIndex` path
- Refreshing the collection's cached index count (`CollectionInfo.indexes`) after a
  create or drop; it stays stale until the collections are refreshed

## Design

Decision: two new Tauri commands in `src-tauri/src/commands/databases.rs`, next to
`list_indexes`:

- `create_index(id, database, collection, keys, options) -> String` (created index name)
- `drop_index(id, database, collection, name) -> ()`
  Request types go in `src/lib/contracts.ts` (`CreateIndexRequest` with
  `keys: Record<string, unknown>`, `name?`, `unique?`, `sparse?`, `expireAfterSeconds?`);
  wrappers go in `src/api/client.ts`.
  Decision: `drop_index` rejects the name `_id_` with `DgridError::Validation`.
  Decision: entry points (sidebar right-click menu):
- collection node → "Create Index…"
- "Indexes" group node → "Create Index…"
- index node → "Drop Index…" (not shown for `_id_`)
  Decision: Create Index dialog fields:
- Keys: multi-line text input, empty, with placeholder `{ field: 1 }`; required
- Name: optional; blank lets MongoDB generate the name
- Unique and Sparse checkboxes
- TTL (seconds): optional integer ≥ 0
  Decision: keys accept mongo shell object syntax, e.g. `{ email: 1, createdAt: -1 }`,
  `{ 'address.city': 1 }` and `{ bio: 'text' }`, as well as strict JSON. Parse them on the
  frontend by exporting the existing `parseJavaScriptObject` from `src/lib/queries.ts`
  (the parser the query editor's `createIndex` uses); don't write a second parser, and
  don't parse in the backend. Parsing happens when the user clicks Create; the dialog
  doesn't validate on every keystroke.
  Decision: if the keys don't parse or parse to something other than a non-empty object,
  show an inline error under Keys and send nothing. Key values are passed through
  unchanged (1, -1, "text", "2dsphere", "hashed"); MongoDB validates them.
  Decision: while a create is running, the Create button shows a spinner and the dialog
  can't be submitted twice. There is no timeout or cancel; index builds on large collections
  can take a while.
  Decision: if the server returns an error (duplicate keys for a unique index, a name
  conflict, an invalid key type), show the error inside the dialog and keep the user's
  input.
  Decision: drop uses the existing `ConfirmDialog`: "Drop index '<name>' on
  <db>.<collection>? This cannot be undone." A failed drop shows an error notification.
  Decision: after a successful create or drop, reload that collection's index list
  (`appStore.loadIndexes`) and show a success notification.
  Flags: new public IPC commands (`create_index`, `drop_index`).

## Acceptance Criteria

- [ ] Right-clicking a collection or its "Indexes" group shows "Create Index…", which
      opens the dialog
- [ ] Views don't offer "Create Index…"
- [ ] Creating `{ email: 1 }` (shell syntax) with Unique checked adds a unique index
      `email_1` to the sidebar list without a manual refresh
- [ ] Keys in strict JSON (`{ "email": 1 }`) and with single-quoted dotted keys
      (`{ 'address.city': 1 }`) are also accepted
- [ ] A name entered in the dialog is used as the index name
- [ ] Entering TTL 3600 creates the index with `expireAfterSeconds: 3600`; its tooltip
      shows the TTL
- [ ] Unparseable keys or `{}` show an inline error under Keys when Create is clicked,
      and no index is created
- [ ] A server error (e.g. a unique index on a field with duplicate values) is shown in
      the dialog, which stays open with its input kept
- [ ] Right-clicking a non-`_id_` index shows "Drop Index…"; confirming removes it from
      the sidebar; cancelling does nothing
- [ ] `_id_` has no "Drop Index…" item, and `drop_index` rejects `_id_` with a
      validation error

## Verification

- `pnpm verify`
- `cargo test` in `src-tauri/` (unit test for the `_id_` rejection and for building
  index options)
- Component tests: `src/__tests__/components/CreateIndexDialog.test.ts` (shell-syntax
  and JSON keys accepted, parse errors and `{}` rejected, disabled state while
  submitting, server error display); extend `src/__tests__/components/Sidebar.test.ts`
  (menu items per node type, no drop for `_id_`)
- Manual (`pnpm dev`, connected to a local MongoDB):
  1. Right-click a collection → Create Index… → keys `{ email: 1 }`, Unique → Create.
     `email_1` appears under Indexes.
  2. Hover `email_1`; the tooltip shows unique.
  3. Right-click `email_1` → Drop Index… → Confirm. It disappears.
  4. Right-click `_id_`: no Drop item.

## Boundaries

Don't touch: the query-editor `createIndex` / `dropIndex` behavior in `executor.rs` /
`queries.ts`. Exporting `parseJavaScriptObject` is fine; changing its behavior is not.

## Notes

**2026-09-26T23:24:45Z**

Refined: scoped to create + drop from the sidebar (editing deferred to a possible follow-up); keys accept shell syntax by exporting the existing parseJavaScriptObject from queries.ts, no backend parsing; stale collection index count accepted.
