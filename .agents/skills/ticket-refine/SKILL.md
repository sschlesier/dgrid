---
name: ticket-refine
description: Turn a rough ticket or idea into a spec an agent can implement unattended. Drafts the whole ticket from the repo first, then asks only about the gaps against the Definition of Ready. Use when asked to refine, spec out, flesh out or clarify a ticket, when given a ticket ID with status open, triaged, needs-clarification or refined, or when given a new idea to turn into a ticket.
---

# Refine a ticket

Goal: a ticket that passes the Definition of Ready, so an agent with no human to ask can
implement it. Refine writes the spec; it doesn't approve it. Approval is `ticket-approve`,
and it needs a human.

Read these first:

- `.agents/tickets/ticket-format.md`: where ticket state lives, commands, fields
- `.agents/tickets/definition-of-ready.md`: the checklist and the questions for each type

`br` and the `scripts/tickets/` helpers work from any checkout. Don't commit ticket
changes; the user commits them on the `tickets` branch.

## 1. Load or create

- **Ticket ID given:** `br show <id>`. Note its status.
  - `needs-clarification`: the most recent comment has the questions from the agent that
    sent it back. Those questions are the agenda for this pass. Answer each one
    explicitly.
  - `agent-ready`: refining it cancels the approval. Say so before changing anything.
- **Idea given, no ticket:** search for duplicates (`br search "<keywords>" --all`). If
  there's none, `br create` it with a working title. It starts as `open` (captured).
- **Open (not triaged):** do a quick triage inline. Check for duplicates and set type
  and priority. If it's clearly bigger than one PR, stop and propose
  splitting it into separate tickets before refining.

## 2. Research just enough to draft

Read the repo to answer _spec_ questions: does this already exist, what does it do
today, which interfaces does the change touch, what similar feature can serve as a
reference. Stop there. Implementation context (which files to edit, which pattern to
follow) is for the pickup step, when the code is current.

## 3. Draft the whole ticket

Write a complete draft in the ticket's fields (`ticket-format.md`). Fill every Definition
of Ready item you can, based on the ticket, the research and sensible defaults.

- The outcome is one sentence, from the user's point of view.
- Each acceptance criterion describes behavior you can observe.
- Verification: always `pnpm verify`, plus a named test or manual steps with clicks and
  expected results. Add `cargo test` (in `src-tauri/`) when Rust changes.
- Record decisions _with their answers_. If you pick a default, write it as a decision so
  the user can overrule it. It must not look like an assumption.
- Add sections only when they have real content.

## 4. Show the draft plus a list of gaps

Show the draft, then a numbered list of **gaps**: Definition of Ready items you
couldn't settle, plus the ticket-type questions that apply. For each gap:

- say what's missing and why it matters to an agent working alone;
- give a **proposed answer** whenever you can, so the user can reply "1 yes, 2 yes,
  3: use X instead".

Also list the **defaults you chose** (decisions you made without asking), so the user can
overrule them. Keep the list short: only choices an agent would otherwise have to guess.

Example gaps:

- Size or scope problems ("this touches the Rust executor and the UI; split into two?").
- Empty, error and loading states for UI features.

Don't ask about things the repo answers. Don't pad the list; if there are no gaps, say so.

## 5. Revise until done

Apply the answers and show only what changed. Repeat step 4 until there are no gaps, or
the user accepts the ones that remain.

## 6. Write and hand off

1. Write the ticket's fields with `br update <id>`: the description
   (`--description-file`), `--design` and `--acceptance-criteria`, plus `--title`, `-t`
   and `-p` when they changed. Leave the comments alone. If br refuses a rewrite for
   being much shorter, check that the shorter text is intended, then add `--force`.
2. `scripts/tickets/br-lint <id>`: fix every FAIL. Fix WARNs unless the user accepts them.
3. `br update <id> -s refined`
4. `br comments add <id> -m "Refined: <one line on what was settled>"`. If the ticket came
   back from needs-clarification, list which questions were answered and how.
5. Tell the user the ticket is refined and suggest `/ticket-approve <id>`.
