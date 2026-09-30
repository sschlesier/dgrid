---
title: Quote dotted field paths when accepting a field completion
type: bug
priority: 2
approved: "Scott Schlesier, 2026-09-28: quote accepted field paths that aren't plain identifiers; bare inside strings, regexes and comments. Cold read: not run."
status: done
---

When a user tab-completes a dotted field path such as `fee.foo` in the query editor, the
editor inserts `"fee.foo"` (quoted) so the query parses without hand-editing.

Context: field completion (`src/lib/fieldCompletion.ts`) inserts the raw path from the
schema store. The query parser only auto-quotes keys that are plain identifiers
(`src/lib/queries.ts`, the unquoted-key regex), so `{ fee.foo: 1 }` fails to parse today.
Top-level fields like `name` already work unquoted.

Out of scope:

- Changing the query parser to accept unquoted dotted keys
- Installing E2E tooling (`tauri-webdriver`) in the pickup environment
- Changing which fields are offered, their order or how they're filtered
- Context-aware completion (key vs. value position, operator completion)
- Multi-word prefixes: typing `my fi` and accepting `my field` still replaces only `fi`
  (gives `my "my field"`, as it gives `my my field` today)

## Acceptance criteria

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

## Steps to Reproduce

1. `pnpm dev`, connect, open a collection containing `{ fee: { foo: 1 } }`
2. Run `db.coll.find({})` so the field names are cached
3. Type `db.coll.find({ fee.f`, press Tab twice to accept `fee.foo`
4. Finish with `: 1 })` and press Cmd+Enter

Expected: results load. Actual: the editor holds `{ fee.foo: 1 }` unquoted and the query
fails with a parse error.

## Verification

- `pnpm verify`
- `pnpm test src/__tests__/fieldCompletion.test.ts`: new unit tests that apply completions
  to an `EditorState` with `javascript()` + `closeBrackets()`, covering each criterion above
- `pnpm e2e --spec tests/webdriver/specs/field-autocomplete.e2e.mjs`: new test in the
  existing spec. Seed `{ fee: { foo: 1 } }`, complete `find({ fee.f` → the editor text
  contains `{ "fee.foo"` (or the documented skip)
- Manual: `pnpm dev`, connect, open a collection that has a nested document
  (e.g. `{ fee: { foo: 1 } }`), run `db.coll.find({})` once so the fields are cached, then
  type `db.coll.find({ fee.f`, press Tab twice → the editor shows `db.coll.find({ "fee.foo"`.
  Finish with `: 1 })`, press Cmd+Enter → results load, no parse error.

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
- E2E run: the runner builds the debug app itself and starts MongoDB through
  `mongodb-memory-server`, so the only external requirement is `tauri-webdriver`. If the
  runner stops with "tauri-webdriver is not installed", don't install it. Still write the
  new e2e test, rely on the unit tests for the criteria, and record in a note that the live
  run was skipped and why. A build failure or a failing spec is not a skip: stop and
  report it.

## Boundaries

Don't touch: `src/lib/queries.ts` (the parser)

## Log

- 2026-09-26: Refined: quote any accepted path failing the parser's unquoted-key pattern (dotted, hyphen, leading digit, spaces) with double quotes; insert bare inside String/TemplateString/RegExp/comments; multi-word prefixes out of scope; unit tests plus a WebdriverIO e2e test in field-autocomplete.e2e.mjs.
- 2026-09-27: Migrated from tk dgr-3xo6 (created 2026-09-26T23:27:52Z).
- 2026-09-28: Approved by Scott Schlesier: quote accepted field paths that aren't plain identifiers; bare inside strings, regexes and comments. Cold read: not run.
- 2026-09-28: Started on branch fix-quote-dotted-completions
- 2026-09-28: Done: field completions now carry an `apply` (`applyFieldCompletion` in `src/lib/fieldCompletion.ts`) that wraps the path in double quotes when it fails `^[A-Za-z_$][\w$]*$`, and inserts it bare when the syntax node at the cursor (or an ancestor, stopping at a template `Interpolation`) is String, TemplateString, RegExp, LineComment or BlockComment. The label stays unquoted. Branch `fix-quote-dotted-completions`.

  Also added `@codemirror/language` as a direct dependency (it was already installed transitively; needed for `syntaxTree`).

  Verified:
  - `pnpm verify` passes.
  - `src/__tests__/fieldCompletion.test.ts`: 12 tests covering each criterion, applied through the option's `apply` in a real EditorView with `javascript()` + `closeBrackets()`. Checked they fail when the fix is removed (4 quoting tests) and when the syntax check is disabled (6 bare-context tests).
  - `field-autocomplete.e2e.mjs`: new test seeds `{ fee: { foo: 1 } }`, accepts `fee.foo` after `find({ fee.f`, asserts the editor holds `{ "fee.foo"`, then runs `…: 1 })` and sees only the matching doc. Passed 3/3 runs with the fix; fails with the expected assertion without it.

  Not done: the manual `pnpm dev` check (no interactive session); the E2E test drives the same flow in the real app.

  Observed: in two runs without the fix, the app quit silently in a later test after the new test failed (WebDriver socket errors, empty app log). It didn't happen in any run with the fix. Not investigated.
- 2026-09-30: Imported from br as dgr-o0k.
- 2026-09-30: Merged on 2026-09-28 as PR #42 (77f5303), before the move to the spec store. Criteria left unticked: not checked by a pr-review.
