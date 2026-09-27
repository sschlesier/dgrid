# Ticket format and operations

Tickets are issues in [br](https://github.com/Dicklesworthstone/beads_rust) (beads_rust).
Pipeline helpers live in `scripts/tickets/`: `br-stage`, `br-stages`, `br-lint`.

## Where ticket state lives

The br workspace is on the `tickets` branch, an orphan branch that shares no history with
`main`, checked out as a worktree at `~/src/worktrees/dgrid/tickets`. Every Claude session
gets `BEADS_DIR` pointing at its `.beads/` from `.claude/settings.json`, so `br` works the
same from the main checkout, any worktree, or anywhere else, and every agent sees the same
state immediately.

- `br where` shows the workspace in use. If `br` says "Beads not initialized", `BEADS_DIR`
  isn't set: stop and tell the user. Never run `br init`.
- Change tickets only through `br` and the helpers. Never edit files in `.beads/`.
- **Agents never commit tickets.** br keeps its SQLite database and `.beads/issues.jsonl`
  up to date; the user commits `issues.jsonl` on the `tickets` branch. Don't run git in
  the tickets worktree, and ticket changes never go in a code commit.

## Running br in a worktree

Worktree-isolated sessions refuse commands they can't verify. Run each `br` command as its
own Bash call with literal arguments: no `$VAR`, `$(...)`, `$'...'` or `&&` chains. Use
the ticket ID itself, not a variable holding it. Multi-line Markdown in a quoted argument
is fine; for long text, write it to a file outside the repo (your scratchpad or temp
directory) and pass the path (`--description-file`, `br comments add <id> -f <file>`).

## Operations

| Operation                   | Command                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------ |
| Read                        | `br show <id>` (`--json` for scripts)                                                |
| Create                      | `br create "<title>" -t <type> -p <0-4> -l stage:captured -d "<outcome>" --silent` (prints the ID) |
| Set description             | `br update <id> --description-file <file>`                                           |
| Set design                  | `br update <id> --design "<text>"`                                                   |
| Set acceptance criteria     | `br update <id> --acceptance-criteria "<checklist>"`                                 |
| Set stage                   | `scripts/tickets/br-stage <id> <stage>`                                              |
| Add a note                  | `br comments add <id> -m "<text>"` (or `-f <file>`); timestamped, append-only        |
| List by stage               | `br list -l stage:<stage>`, or `scripts/tickets/br-stages` for the whole board       |
| Pickup candidates           | `br ready -l stage:agent-ready`                                                      |
| Lint                        | `scripts/tickets/br-lint <id>` (exits 1 on FAIL)                                     |
| Start / close               | `br update <id> --claim`, `br close <id> -r "<reason>"`                              |
| Type, priority, title       | `br update <id> -t <type>`, `-p <n>`, `--title "<title>"`                            |
| Dependencies                | `br dep add <id> <depends-on-id>`, `br dep tree <id>`                                |
| Related tickets             | `br dep add <id> <other-id> -t related`                                              |
| Search                      | `br search "<text>"` (titles, descriptions, IDs, comments; `--all` for closed)       |

`br update` refuses to shrink a field to less than half its length without `--force`.
When a rewrite is meant to be shorter, check it first, then pass `--force`.

Stages (labels): `captured` → `triaged` → `refined` → `agent-ready`, plus
`needs-clarification` and `review`. In-progress and closed come from br's status
(`br update --claim`, `br close`), not from labels. An issue has at most one `stage:*`
label; `br-stage` replaces the old one.

## Fields

| Field                 | Holds                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| title                 | Short imperative title                                                                                                                                       |
| description           | The **Outcome** (first paragraph), then optional `Context:` and `Out of scope:` paragraphs, then `## Verification`, then optional `## Boundaries`          |
| design                | Decisions and their answers, constraints, affected interfaces. Flags: migration / public API / config change (only the ones that apply)                     |
| acceptance criteria   | A checklist of testable statements (`- [ ] …`)                                                                                                               |
| comments              | Notes: progress, questions, completion notes. Added with `br comments add`; never edited or removed                                                          |
| labels                | `stage:<stage>`                                                                                                                                              |
| external ref          | For tickets migrated from tk, the old tk ID (e.g. `dgr-mk2m`)                                                                                                |

A description looks like this:

```markdown
Users can export the current result grid to a CSV file from the toolbar.

Context: why this matters, current behavior, links.

Out of scope:

- Excel export

## Verification

- `pnpm verify`
- `pnpm test src/lib/export.test.ts`
- Manual: open a collection, click Export, open the file

## Boundaries

Stop and send back if: …
Don't touch: …
```

Rules:

- **Required:** the Outcome, acceptance criteria and `## Verification` (`br-lint` enforces
  them).
- Write any other section only when it has real content. Never leave an empty heading.

## Tickets from tk

Tickets created before the move to br kept their history but got new IDs. The old tk ID is
the issue's external ref and appears in its first comment, so `br search dgr-mk2m --all`
finds it (`--all` includes closed tickets). `tk-id-map.json` on the `tickets` branch maps every old ID to its new one. Commit
messages from before the move use the old IDs.
