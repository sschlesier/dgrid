---
name: ticket-review
description: Refine a ticket until an agent could implement it unattended, then get a person's approval and label it approved. Use when asked to refine, review, spec out or approve a ticket, when given a new idea to turn into a ticket, or before starting work on a ticket that isn't approved.
---

# Review a ticket

Goal: a ticket that passes the checklist in `.agents/tickets.md`, approved by a person.
Read that file first; it has where tickets live, the fields, the checklist, the questions
by type, the approval convention and the cold read prompt.

**Never approve without an explicit yes from the user in this conversation.** Being asked
to run this skill, or to "approve dgr-xyz", starts the review; it isn't the yes.

## 1. Load

- **Ticket ID given:** `br show <id>`.
  - Has the `approved` label: say so. Changing its spec removes the label.
  - Latest comment starts `Needs clarification:`: those questions are the agenda. Answer
    each one explicitly.
- **Idea given, no ticket:** `br search "<keywords>" --all` for duplicates. If there's
  none, `br create` it.
- **Nothing given:** list open, unapproved tickets and ask which one. One at a time.
- **Epic:** don't approve it. Check it's split into children that each fit one PR, then
  review the children.

## 2. Draft

Read the repo just enough to answer spec questions: what exists today, which interfaces
change (Tauri commands, stores, components), what similar feature can serve as a
reference. Leave implementation details (which files to edit, which pattern to follow) to
whoever picks it up. Then fill every checklist item you can from the ticket, the repo and
sensible defaults. Write defaults as decisions in the design field so they can be
overruled.

Write the fields with `br update` (see `.agents/tickets.md`), then run
`scripts/tickets/br-lint <id>` and fix what it reports.

## 3. Cold read

Run the cold read from `.agents/tickets.md` in a fresh `general-purpose` subagent when the
ticket spans more than one area (e.g. the Rust backend and the Svelte UI) or its design
has flags. Otherwise offer it. Fold BLOCKING entries and SPEC ISSUES into the gaps below.

## 4. Summarize

Show this, then the gaps:

```
<title>   (<id>, <type>, P<n>)
Outcome:      <one sentence>
Acceptance:   <n> criteria
Verification: <commands, one line>
Flags:        <migration / public API / config, or none>
Boundaries:   <ticket-specific, or "default rule">
Dependencies: <each dependency and its status, or none>
Cold read:    <pass | blocked | not run>
```

- **Gaps:** numbered checklist items you couldn't settle, and cold read blocking
  questions. Give a proposed answer for each, so the user can reply "1 yes, 2: use X".
- **Defaults chosen:** only choices an agent would otherwise have to guess.

Don't ask what the repo answers. If there are no gaps, say so.

## 5. Revise

Apply the answers to the ticket and show only what changed. Repeat until there are no
gaps, or the user accepts the ones left.

## 6. Decide

Ask with AskUserQuestion:

- **Approve**: label it approved
- **Send back**: record the open questions and leave it unapproved
- **Leave as is**: no approval change

Then record it:

- **Approve:** `br label add <id> -l approved`, then
  `br comments add <id> -m "Approved by <name>: <one line>. Cold read: <pass | blocked, overridden: reason | not run>."`
  with `<name>` from `git config user.name`. If `br ready -l approved` doesn't list it,
  say which dependency is still open.
- **Send back:** remove the label if present (`br label remove <id> -l approved`), then
  `br comments add <id> -m "Needs clarification: <the questions>"`.

Commit the ticket changes on `main` as described in `.agents/tickets.md`.
