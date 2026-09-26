---
id: dgr-3xo6
status: open
deps: []
links: []
created: 2026-09-26T23:27:52Z
type: bug
priority: 2
assignee: Scott Schlesier
tags: [stage:refined]
---

# Quote dotted field paths when accepting a field completion

When a user tab-completes a dotted field path such as `fee.foo` in the query editor, the
editor inserts `"fee.foo"` (quoted) so the query parses without hand-editing.

Context: field completion (`src/lib/fieldCompletion.ts`) inserts the raw path from the
schema store. The query parser only auto-quotes keys that are plain identifiers
(`src/lib/queries.ts`, the unquoted-key regex), so `{ fee.foo: 1 }` fails to parse today.
Top-level fields like `name` already work unquoted.

Out of scope:

- Changing the query parser to accept unquoted dotted keys
- Changing which fields are offered, their order or how they're filtered
- Context-aware completion (key vs. value position, operator completion)
- Multi-word prefixes: typing `my fi` and accepting `my field` still replaces only `fi`
  (gives `my "my field"`, as it gives `my my field` today)

## Design

- Which paths get quoted: any path that doesn't match the parser's unquoted-key pattern
  `^[A-Za-z_$][\w$]*$` (e.g. `fee.foo`, `first-name`, `2024total`, `my field`). Matching
  paths (`name`, `_id`) are inserted bare, as today.
- Quote character: double quotes.
- Only the accepted option is ever quoted. The typed prefix is replaced, never wrapped.
- Insert the path bare, without adding quotes, when the syntax node at the cursor is
  `String`, `TemplateString`, `RegExp`, `LineComment` or `BlockComment`
  (`@lezer/javascript` node names). This covers `"fee.f`, `'fee.f`, `"$fee.f` and the
  closing quote closeBrackets adds automatically. Existing quotes are left as they are.
- The popup label stays unquoted (`fee.foo`). Only the inserted text changes.
- After insertion the cursor sits after the closing quote. Inside an existing string it
  sits right after the path.

## Acceptance Criteria

- [ ] Typing `{ fee.f`, Tab, and accepting `fee.foo` produces `{ "fee.foo"` with the cursor after the closing quote
- [ ] Accepting a plain identifier field (`name`) inserts `name` unquoted
- [ ] Accepting a non-identifier top-level field (`first-name`) inserts `"first-name"`
- [ ] Accepting `my field` after typing `{ my` inserts `{ "my field"`
- [ ] With the cursor inside `{ "fee.f|" }`, accepting `fee.foo` produces `{ "fee.foo" }` with no doubled quotes
- [ ] Same inside single quotes: `{ 'fee.f|' }` → `{ 'fee.foo' }`
- [ ] Inside an aggregation ref `"$fee.f|"`, accepting `fee.foo` produces `"$fee.foo"`
- [ ] Accepting `fee.foo` inside a regex literal (`/fee.f|/`) or a `//` comment inserts `fee.foo` bare
- [ ] The completion popup still shows the label `fee.foo` without quotes
- [ ] `db.coll.find({ fee.f` → complete → `: 1 })` executes without a parse error

## Verification

- `pnpm verify`
- `pnpm test src/__tests__/fieldCompletion.test.ts`: new unit tests that apply completions
  to an `EditorState` with `javascript()` + `closeBrackets()`, covering each criterion above
- `pnpm e2e --spec tests/webdriver/specs/field-autocomplete.e2e.mjs`: new test in the
  existing spec. Seed `{ fee: { foo: 1 } }`, complete `find({ fee.f` → the editor text
  contains `{ "fee.foo"`
- Manual: `pnpm dev`, connect, open a collection that has a nested document
  (e.g. `{ fee: { foo: 1 } }`), run `db.coll.find({})` once so the fields are cached, then
  type `db.coll.find({ fee.f`, press Tab twice → the editor shows `db.coll.find({ "fee.foo"`.
  Finish with `: 1 })`, press Cmd+Enter → results load, no parse error.

## Boundaries

Don't touch: `src/lib/queries.ts` (the parser)

## Notes

**2026-09-26T23:36:56Z**

Refined: quote any accepted path failing the parser's unquoted-key pattern (dotted, hyphen, leading digit, spaces) with double quotes; insert bare inside String/TemplateString/RegExp/comments; multi-word prefixes out of scope; unit tests plus a WebdriverIO e2e test in field-autocomplete.e2e.mjs.
