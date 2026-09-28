# Writing tickets

Tickets are [br](https://github.com/Dicklesworthstone/beads_rust) (beads_rust) issues in
`.beads/`, tracked in git on `main`. This file covers where ticket state lives, what makes a
ticket good and how a ticket gets approved. It adds no statuses on top of standard br;
approval is a label.

A ticket is good when an agent with no human to ask can implement it from the ticket plus
the repo.

## Where ticket state lives

br finds `.beads/` in the main checkout even when run from a worktree, so every checkout and
agent sees the same tickets. `br where` shows the workspace in use.

- Change tickets only through `br`. Never edit files in `.beads/` by hand.
- br keeps `.beads/issues.jsonl` in the main checkout up to date. A worktree's own copy of
  `.beads/` is stale: never commit it on a feature branch.
- Commit ticket changes on `main` from the main checkout, on their own:
  `git -C <main checkout> commit .beads/issues.jsonl -m "chore(tickets): <what changed>"`.
  Never mix them into a code commit.

### Running br in a worktree

Worktree-isolated sessions refuse commands they can't verify. Run each `br` command as its
own Bash call with literal arguments: no `$VAR`, `$(...)`, `$'...'` or `&&` chains. Use the
ticket ID itself, not a variable holding it. Multi-line Markdown in a quoted argument is
fine; for long text, write it to a file outside the repo (your scratchpad or temp
directory) and pass the path (`--description-file`, `br comments add <id> -f <file>`).

## Fields

| Field               | Holds                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| title               | Short imperative title                                                                                                                            |
| description         | The **Outcome** (first paragraph), then optional `Context:` and `Out of scope:` paragraphs, then `## Verification`, then optional `## Boundaries` |
| design              | Decisions and their answers, constraints, affected interfaces. Flags: migration / public API / config change (only the ones that apply)           |
| acceptance criteria | A checklist of testable statements (`- [ ] …`)                                                                                                    |
| comments            | Progress notes, questions, completion notes. Added with `br comments add`; never edited or removed                                                |

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

Stop and ask if: …
Don't touch: …
```

Rules:

- **Required:** the Outcome, acceptance criteria and `## Verification`. Bugs also need
  steps to reproduce in the description. `scripts/tickets/br-lint <id>` checks the
  required parts.
- Write any other section only when it has real content. Never leave an empty heading.

Commands:

```bash
br create "<title>" -t <type> -p <0-4> -d "<outcome>" --silent   # prints the ID
br update <id> --description-file <file>    # long Markdown: write it to a temp file first
br update <id> --design "<text>"
br update <id> --acceptance-criteria "<checklist>"
br dep add <id> <depends-on-id>             # -t related for a non-blocking link
br search "<text>" --all                    # --all includes closed tickets
```

`br update` refuses to shrink a field to less than half its length without `--force`.
When a rewrite is meant to be shorter, check it first, then pass `--force`.

## Checklist

Before a ticket is worked on, check each item.

| #   | Item                    | Good when                                                                                                                                  | Recorded in                                  |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| 1   | **Outcome**             | One sentence: what is different when this is done, and for whom. Not a task list.                                                          | description, first paragraph                 |
| 2   | **Acceptance criteria** | Each one is a statement that can be tested by observing behavior. No "works well" or "is clean".                                           | acceptance criteria                          |
| 3   | **Verification**        | Exact commands or steps that prove the criteria hold: `pnpm verify`, `cargo test` (in `src-tauri/`) when Rust changes, plus a named test or manual steps with expected results. | `## Verification` in description             |
| 4   | **Scope**               | Clear what's out of scope where there's a plausible way to overreach. Migrations, public API changes and config changes are flagged.       | Out of scope in description; flags in design |
| 5   | **Size**                | Fits in one PR and one agent session. If not, split it and link the parts with `br dep add`. An epic is never worked on directly.         | type; dependencies                           |
| 6   | **Dependencies**        | Each dependency exists and is expected to close first, or the ticket says what to stub.                                                    | dependencies                                 |
| 7   | **No open decisions**   | Every "should we X or Y?" is answered, with the answer written down.                                                                       | design                                       |
| 8   | **Constraints**         | Performance, compatibility, security, "don't touch X", where they apply.                                                                   | design or `## Boundaries` in description     |
| 9   | **Autonomy boundaries** | Anything _specific to this ticket_ the agent must stop and ask about. The default rule below always applies, so write only exceptions.     | `## Boundaries` in description               |

When drafting a ticket, fill every item you can from the repo and sensible defaults. If
you pick a default, write it as a decision in the design field so it can be overruled; it
must not look like an assumption. Then ask only about the gaps, with a proposed answer
for each.

### Default blocking rule

While implementing, stop and ask only when a gap would change **public behavior, data, or
scope**. For anything else, state the assumption in a comment (`br comments add`) and
continue. `## Boundaries` can tighten this rule for a ticket.

### Questions by type

Prompts for writing the ticket, not required sections. Ask only the ones that apply.

- **bug:** steps to reproduce; expected vs. actual; environment/version; is there a
  regression test to add?
- **feature:** who uses it and from where in the UI; affected interfaces (Tauri commands,
  stores, components); empty, error and loading states.
- **task / chore:** what "done" means concretely; anything that must keep working
  unchanged.
- **major dependency upgrade** (npm, Cargo or any other): the design must require reading
  the release notes for every major version crossed (e.g. 15 → 20 means 16, 17, 18, 19
  and 20) and checking each breaking change against how the repo uses the package, before
  changing anything. An acceptance criterion requires the completion note to list each
  breaking change as "affects us" (with file refs) or "doesn't affect us" (with a reason).

## Approval

A ticket is approved when it has the `approved` label. Only a person approves, by saying
yes in a conversation; `/ticket-review` walks through the review and records it:

```bash
br label add <id> -l approved
br comments add <id> -m "Approved by <name>: <one line>. Cold read: <pass | blocked, overridden: reason | not run>."
```

- `br ready -l approved` lists approved tickets that can be started. Plain `br ready`
  includes unapproved ones.
- To send a ticket back, leave it unapproved (remove the label if it has one) and add a
  comment starting `Needs clarification:` with the questions.
- Changing an approved ticket's outcome, acceptance criteria, design or boundaries removes
  the label. It needs another review.
- Epics are never approved; their children are.

## Working a ticket

1. Start only tickets that `br ready -l approved` lists: `br update <id> --claim` (sets
   `in_progress` and assigns you).
2. Implement it on a branch, with the ticket ID in the commit messages.
3. When done, add a completion note: `br comments add <id> -m "Done: <what changed, how it
   was verified, any assumptions>"`. Leave the ticket `in_progress`; the user closes it
   when the branch is merged.

## Cold read

A cold read checks whether a ticket can be implemented by an agent that knows **only the
ticket and the repo**. `/ticket-review` runs it automatically on tickets that span more
than one area (e.g. the Rust backend and the Svelte UI) or carry flags, and offers it
otherwise. Run it in a fresh subagent (Agent tool, `general-purpose`) so no conversation
context leaks in. The subagent must not edit anything.

Fill in `<TICKET_ID>` and `<REPO_PATH>`; change nothing else, so results stay comparable.

```
You are about to implement a ticket with no human available to answer questions.
Before writing any code, check whether the ticket is implementable as written.

Ticket: <TICKET_ID>   (read it with `br show <TICKET_ID>`)
Repository: <REPO_PATH>   (read AGENTS.md first)

Read the ticket and explore the code it touches. Do not edit any files.

Blocking rule: a gap is BLOCKING only if resolving it differently would change public
behavior, data, or scope. Everything else is an ASSUMPTION you would state and proceed
with. The ticket's "## Boundaries" section (in its description), if present, can make
more things blocking.

Report exactly in this format:

VERDICT: pass | blocked

PLAN:
1. <step: what changes, and where>
...

BLOCKING:
- <question> — why it's blocking (behavior/data/scope), and what you would otherwise
  have to guess
(or "none")

ASSUMPTIONS:
- <assumption you would make and proceed with>
(or "none")

SPEC ISSUES:
- <acceptance criteria that can't be tested, verification that can't be run,
  contradictions between the ticket and the code>
(or "none")
```

Any BLOCKING entry means the ticket needs another pass, whatever VERDICT says. Many
ASSUMPTIONS on one ticket is a warning sign even if it passes. SPEC ISSUES are worth
fixing but don't block on their own.
