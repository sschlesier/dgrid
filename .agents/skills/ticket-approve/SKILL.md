---
name: ticket-approve
description: Human sign-off that makes a refined ticket agent-ready (eligible for unattended pickup). Runs br-lint, summarizes the ticket for review, optionally runs a preview cold read, then records the approval or sends the ticket back. Use when asked to approve, sign off or review a refined ticket, or when told to make a ticket agent-ready.
---

# Approve a ticket

`agent-ready` means an agent may pick up the ticket with **no human involved**. This skill
is the trust boundary before that. **Never approve without an explicit yes from the user
in this conversation.** A request like "approve dgr-a1b2" starts the review; it isn't the
yes. Being asked to run this skill, or a summary that looks fine, is not approval either.

Read `.agents/tickets/ticket-format.md` first. Don't commit ticket changes; the user
commits them on the `tickets` branch.

## 1. Select

- Ticket ID given: use it.
- None given: list `br list -s refined` and ask which one. Review one ticket at a time.
- The ticket must have status `refined`. Otherwise stop and name the right skill
  (`ticket-refine` for open, triaged or needs-clarification).

## 2. Lint

Run `scripts/tickets/br-lint <id>`. If anything FAILs, stop: show the failures and suggest
`/ticket-refine <id>`. Show any WARNs in the summary below.

## 3. Summarize for review

Keep it short and easy to scan. This is what the human judges.

```
<id>  <title>   (<type>, P<n>)
Outcome:      <one sentence>
Acceptance:   <n> criteria
Verification: <commands, one line>
Flags:        <migration / public API / config, or none>
Boundaries:   <ticket-specific, or "default rule">
Dependencies: <each dependency and its status, or none>
```

Then go through the Definition of Ready items that need judgment
(`.agents/tickets/definition-of-ready.md` items 4, 5, 7, 8 and 9). List only the ones
with a **concern**, one line each, and say what's wrong. If there are none, say "no
concerns".

## 4. Offer a preview cold read

Ask whether to run a preview cold read (`.agents/tickets/cold-read.md`). Recommend it when
the ticket touches more than one area of the app or has flags. It's advice for the
reviewer, not a gate.

If it runs, show the verdict, blocking questions, and any assumptions or spec issues. If
it found blocking questions, recommend sending the ticket back.

## 5. Ask for the decision

Use AskUserQuestion with these options:

- **Approve**: make it agent-ready
- **Send back**: back to refinement with the reviewer's concerns
- **Leave as is**: no change

## 6. Record it

br's policy requires the comment on both transitions, so the note and the status change
are one command.

**Approve:** `br update <id> -s agent-ready --transition-comment "Approved for agent pickup by <name>. Preview cold read: <pass | blocked, overridden: reason | not run>."`,
with `<name>` from `git config user.name`.

**Send back:** `br update <id> -s needs-clarification --transition-comment "<the concerns, written as questions>"`,
so `ticket-refine` can use them as its agenda.

**Leave as is:** change nothing.

Report the final status. If you approved it and `br ready` doesn't list it, say which
dependency is still open.
