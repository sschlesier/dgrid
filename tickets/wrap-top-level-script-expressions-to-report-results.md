---
agent: "STOP: run `spx help --skill` and follow it before any work on this spec. Use spx for every store step; never edit the store by hand."
title: Wrap top-level script expressions to report results
type: feature
priority: 2
depends-on: []
parent: shell-mode-that-runs-scripts-through-mongosh
approved: "Scott Schlesier, 2026-11-14: Approved as drafted. Cold read: not run"
status: in-review
---

A frontend function rewrites a user's shell script so each top-level expression reports its value through `__dgrid.result()`, which lets one script run produce one result per statement.

## Context

Part of the Shell mode epic. A mongosh script file does not return the value of its statements, so the script is instrumented before it is sent to `execute_shell`. This spec is a pure TypeScript library with tests; nothing calls it yet.

## Acceptance criteria

- [x] `instrumentShellScript('db.users.find({})')` returns script `__dgrid.result(0, (db.users.find({})));` and one statement `{ index: 0, text: 'db.users.find({})' }`.
- [x] A script with three top-level expression statements wraps them with indexes 0, 1, 2 in source order, and `statements` lists their original text (without a trailing semicolon).
- [x] Declarations (`const`, `let`, `var`, `function`, `class`) and control-flow statements (`if`, `for`, `while`, `try`, blocks) are left byte-for-byte unchanged, including expressions nested inside them.
- [x] A top-level assignment (`x = 5`, `x += 1`), an update (`i++`) and a string directive (`'use strict'`) are left unchanged.
- [x] A top-level statement containing `await` outside a function body is left unchanged.
- [x] Statements written without semicolons, several statements on one line, and a statement spanning several lines are all wrapped correctly.
- [x] Comments and string contents that look like code are never rewritten.
- [x] The returned script has the same number of lines as the input, and every unwrapped line is identical to the input line.
- [x] A script with a syntax error is returned unchanged with an empty `statements` list.
- [x] An empty or whitespace-only script returns itself and an empty `statements` list.

## Verification

- `pnpm verify`
- `pnpm test src/__tests__/shellScript.test.ts`: one test per criterion.
- Manual, with `mongosh` installed, to prove the output really runs: put the instrumented form of `const n = 2; n * 3` after a line `globalThis.__dgrid = { result: (i, v) => print(i, v) };` in a file and run `mongosh --nodb --quiet --norc <file>`. Expected output: `0 6`.

## Design

- **File:** `src/lib/shellScript.ts`, exporting

  ```ts
  export interface ShellStatement { index: number; text: string }
  export interface InstrumentedScript { script: string; statements: ShellStatement[] }
  export function instrumentShellScript(source: string): InstrumentedScript;
  ```

- **Parser:** the Lezer JavaScript parser already shipped with `@codemirror/lang-javascript` (`javascriptLanguage.parser`). No new dependency.
- **Rule:** walk only the direct children of the top-level `Script` node. Wrap a child when it is an `ExpressionStatement` whose expression is not an assignment, not an update expression, not a lone string literal, and contains no `await` outside a nested function.
- **Rewrite:** replace the expression's source range with `__dgrid.result(<index>, (<expression text>))` and make sure the statement ends with `;`. Always add the inner parentheses, so a comma expression stays one argument. Insert no newlines, so mongosh's error line numbers match the editor.
- **Why `await` is skipped:** measured on mongosh 2.14.2, `await` inside a call argument in a script file is a syntax error.
- **Syntax errors:** if the tree contains any error node, return the source unchanged. mongosh then reports the syntax error itself with the user's own line numbers.
- **Trailing-value convention:** a statement such as `print(x)` is wrapped too; it reports `undefined`, which the backend drops.

## Boundaries

- Don't touch: `src/lib/queries.ts`, `src/lib/querySplitter.ts`.

## Log

- 2026-11-14: Approved: Scott Schlesier, 2026-11-14: Approved as drafted. Cold read: not run
- 2026-11-16: Started on branch feat/wrap-shell-script-expressions
- 2026-11-16: Status: in-progress
- 2026-11-16: Status: in-review
- 2026-11-17: Assumption: a parenthesized assignment such as (x = 1) is wrapped, since only a bare assignment is left unchanged; open for decision in review round 1
- 2026-11-17: Dismissed (review round 1): the ArithOp guard and empty-script early return in shellScript.ts are equivalent to the checks that follow them
