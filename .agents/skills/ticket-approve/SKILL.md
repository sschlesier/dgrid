---
name: ticket-approve
description: Human sign-off that makes a refined tk ticket agent-ready (eligible for unattended pickup). Runs tk-lint, summarizes the ticket for review, optionally runs a preview cold read, then records the approval or sends the ticket back. Use when asked to approve, sign off or review a refined ticket, or when told to make a ticket agent-ready.
---

# Approve a ticket

`agent-ready` means an agent may pick up the ticket with **no human involved**. This skill
is the trust boundary before that. **Never approve without an explicit yes from the user
in this conversation.** A request like "approve dgr-a1b2" starts the review; it isn't the
yes. Being asked to run this skill, or a summary that looks fine, is not approval either.

Read `.agents/tickets/ticket-format.md` first. All `tk` commands run from `$MAIN`, and the
decision is committed to `main` as soon as it's recorded ("Committing ticket changes").

## 1. Select

- Ticket ID given: use it.
- None given: list `tk ls -T stage:refined` and ask which one. Review one ticket at a time.
- The ticket must be in stage `refined`. Otherwise stop and name the right skill
  (`ticket-refine` for captured, triaged or needs-clarification).

## 2. Lint

Run `tk-lint <id>`. If anything FAILs, stop: show the failures and suggest
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

**Approve:**

1. `tk-stage <id> agent-ready`
2. `tk add-note <id> "Approved for agent pickup by $(git config user.name). Preview cold read: <pass | blocked, overridden: reason | not run>."`
3. Commit on `main`: `chore(tickets): <id> agent-ready`

**Send back:**

1. `tk-stage <id> needs-clarification`
2. `tk add-note <id>` with the concerns written as questions, so `ticket-refine` can use
   them as its agenda.
3. Commit on `main`: `chore(tickets): <id> sent back for clarification`

**Leave as is:** change nothing.

Report the final stage. If you approved it and `tk ready -T stage:agent-ready` doesn't
list it, say which dependency is still open.
