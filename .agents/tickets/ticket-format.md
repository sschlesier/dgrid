# Ticket format and operations

Tickets are managed with `tk` (wedow/ticket) and live as Markdown files in `.tickets/`.
Pipeline helpers: `tk-stage`, `tk-stages`, `tk-lint` (standalone commands on PATH).

## Where ticket state lives

Ticket state lives in the **main checkout**, never in a worktree's copy of `.tickets/`.
Otherwise stage changes made in one worktree are invisible to the others. Run every
ticket command from the main checkout:

```bash
MAIN="$(git worktree list --porcelain | awk 'NR==1 {print $2}')"
cd "$MAIN" && tk show abc1
```

Running from `$MAIN` also matters for `tk create`: it takes the ID prefix from the
current directory's name, so creating a ticket from a worktree produces the wrong
prefix. Edit ticket files at `$MAIN/.tickets/<id>.md`.

## Committing ticket changes

Commit every ticket change to `main` in `$MAIN` as soon as it's made, so every agent sees
the same ticket state and nothing is left uncommitted. Never commit ticket changes on a
branch or in a worktree.

**When:** after each ticket action and before moving on or ending your turn. A ticket
action is one logical change: creating a ticket, a stage change with its note, writing a
refined spec (plus its stage change and note), or a progress note during pickup. Touch
several tickets in one action (e.g. `tk dep`)? Commit them together.

**How:**

```bash
MAIN="$(git worktree list --porcelain | awk 'NR==1 {print $2}')"
test "$(git -C "$MAIN" branch --show-current)" = main || { echo "main checkout is not on main"; exit 1; }
git -C "$MAIN" add -- .tickets/<id>.md
git -C "$MAIN" commit -m "chore(tickets): <id> <what changed>" -- .tickets/<id>.md
```

- Name the ticket files explicitly after `--`. That commits only those paths and leaves
  anything else staged or modified in `$MAIN` alone. Never `git add -A` or
  `git commit -a`.
- `git add` first so a newly created ticket file is tracked; the pathspec commit alone
  won't pick up untracked files.
- Messages: `chore(tickets): <id> <action>`, e.g. `chore(tickets): dgr-a1b2 refined`,
  `chore(tickets): dgr-a1b2 agent-ready`, `chore(tickets): dgr-a1b2 blocked on permissions`.
- If `$MAIN` isn't on `main`, stop and tell the user. Don't switch branches.
- If the commit fails because `.git/index.lock` exists (another agent is committing),
  wait a few seconds and retry. Don't delete the lock.
- Don't push; pushing stays with the user.

## Operations

| Operation                      | Command                                                                 |
| ------------------------------ | ----------------------------------------------------------------------- |
| Read                           | `tk show <id>` (partial IDs work)                                       |
| Create                         | `tk create "<title>" -t <type> -p <0-4> -d "<outcome>"` (prints the ID) |
| Set stage                      | `tk-stage <id> <stage>`                                                 |
| Add a note                     | `tk add-note <id> "<text>"` (timestamped, appended under `## Notes`)    |
| List by stage                  | `tk ls -T stage:<stage>`, or `tk-stages` for the whole board            |
| Pickup candidates              | `tk ready -T stage:agent-ready`                                         |
| Lint                           | `tk-lint <id>` (exits 1 on FAIL)                                        |
| Change type, priority or title | edit the frontmatter or the `# Title` line in the file                  |
| Dependencies                   | `tk dep <id> <depends-on-id>`, `tk dep tree <id>`                       |

Stages (tags): `captured` → `triaged` → `refined` → `agent-ready`, plus
`needs-clarification` and `review`. In-progress and closed come from tk's status
(`tk start`, `tk close`), not from tags.

## File layout

```markdown
---
id: dgr-a1b2
status: open
deps: []
links: []
created: 2026-09-26T16:31:05Z
type: feature
priority: 2
assignee: Scott Schlesier
tags: [stage:refined]
---

# Export query results as CSV

Users can export the current result grid to a CSV file from the toolbar. ← Outcome (first paragraph)

Context: why this matters, current behavior, links. ← optional

Out of scope: ← optional

- Excel export

## Design

Decisions and their answers, constraints, affected interfaces.
Flags: migration / public API / config change (only the ones that apply).

## Acceptance Criteria

- [ ] Testable statement
- [ ] Testable statement

## Verification

- `pnpm verify`
- `pnpm test src/lib/export.test.ts`
- Manual: open a collection, click Export, open the file

## Boundaries ← optional

Stop and send back if: …
Don't touch: …

## Notes

**2026-09-26T16:31:05Z**

Added by `tk add-note`. Never edit or remove existing notes.
```

Rules:

- **Required:** the Outcome paragraph, `## Acceptance Criteria` and `## Verification`
  (`tk-lint` enforces them).
- Write any other section only when it has real content. Never leave an empty heading.
- `## Verification` and `## Boundaries` go before `## Notes`.
- `## Notes` belongs to `tk add-note`. Leave it as the last section.
