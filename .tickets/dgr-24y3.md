---
id: dgr-24y3
status: open
deps: []
links: []
created: 2026-09-27T15:13:24Z
type: chore
priority: 3
assignee: Scott Schlesier
tags: [stage:captured]
---

# Move tickets to a tickets branch worktree off main

Tickets live on their own tickets branch, checked out at ~/src/worktrees/dgrid/.tickets, so worktree-isolated agents can update and commit them and main only gets code commits.

Context: this is one option, parked for later while another approach is tried first.
Background sessions isolated in a worktree are refused any git that targets the main
checkout (even read-only `git -C ~/src/dgrid status`, or commands too complex to verify).
So implementation agents can't follow the current rule of committing ticket changes to
main. Ticket commits on main also force code branches to be rebased. Tested 2026-09-26
from a worktree-isolated session: `git add` and `git commit` in a sibling linked
worktree, plain file writes, `tk add-note` with `TICKETS_DIR` and the Write tool into a
sibling worktree were all allowed.

## Design

- Location: `~/src/worktrees/dgrid/.tickets`, a worktree of a new `tickets` branch whose
  root holds only ticket files. `~/src/dgrid/.tickets` becomes a gitignored symlink to it.
  - `tk`, `tk-stage`, `tk-lint` and `tk-stages` walk parent directories for `.tickets`,
    so from `~/src/worktrees/dgrid/<branch>` they find the shared directory with no
    `TICKETS_DIR` or settings change. From main they go through the symlink.
  - Don't put the real directory inside `~/src/dgrid`: git against the main checkout's
    path is what the guard refuses.
- Steps, one commit each, done in a worktree and merged to main:
  1. `git subtree split --prefix=.tickets` to create the `tickets` branch with ticket
     history kept; check it out at `~/src/worktrees/dgrid/.tickets`.
  2. Untrack `.tickets/` on main, add it to `.gitignore`, create the symlink in
     `~/src/dgrid` (not committed).
  3. Rewrite `.agents/tickets/ticket-format.md`, `.agents/skills/ticket-refine/SKILL.md`,
     `.agents/skills/ticket-approve/SKILL.md` and `AGENTS.md`: drop the `$MAIN` lookup,
     pathspec commit, the post-commit `git reset` and "never commit tickets on a branch";
     replace with one literal command,
     `git -C ~/src/worktrees/dgrid/.tickets commit -am "chore(tickets): <id> <action>"`
     (`git add` first for new tickets). Keep: create tickets from main so the prefix is
     `dgr-`; never push.
  4. Verify (see Verification).
- Flags: config change (ticket location and workflow docs).

## Acceptance Criteria

- [ ] A `tickets` branch exists with the history of every current ticket file, files at its root
- [ ] `~/src/worktrees/dgrid/.tickets` is a worktree of `tickets`; `~/src/dgrid/.tickets` is a symlink to it
- [ ] Main no longer tracks `.tickets/` and ignores it
- [ ] Ticket docs and skills describe the new location and commit command, with no `$MAIN` lookup left
- [ ] A worktree-isolated background agent can run `tk add-note` and commit the change in the tickets worktree without being refused

## Verification

- `tk ls` from `~/src/dgrid` and from a code worktree list the same tickets
- `git -C ~/src/worktrees/dgrid/.tickets log --oneline` shows ticket history
- Manual: a background session isolated in a worktree adds a note to a ticket and commits it with the documented command; nothing is refused

## Boundaries

Stop and send back if: the guard refuses `~` in the `git -C` path and the full path also fails, or the pre-commit hook from main's `.husky` runs and fails in the tickets worktree.
Before starting: merge or finish any in-flight worktree branch that still tracks `.tickets/`, or `tk` there will find its stale copy first.
Don't push the `tickets` branch; pushing stays with the user.
