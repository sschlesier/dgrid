# Definition of Ready

A ticket is ready when an agent with no human to ask can implement it from the ticket plus
the repo. Each item says where in the ticket it's recorded (see `ticket-format.md`).

`scripts/tickets/br-lint` checks items 1–3 structurally, and br itself rejects missing or
cyclic dependencies (item 6). The rest need judgment.

| #   | Item                    | Ready when                                                                                                                                     | Recorded in                                       |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | **Outcome**             | One sentence: what is different when this is done, and for whom. Not a task list.                                                              | description, first paragraph                      |
| 2   | **Acceptance criteria** | Each one is a statement that can be tested by observing behavior. No "works well" or "is clean".                                               | acceptance criteria                               |
| 3   | **Verification**        | Exact commands or steps that prove the criteria hold. `pnpm verify` plus anything specific (a named test, a manual check with steps).          | `## Verification` in description                  |
| 4   | **Scope**               | Clear what's out of scope where there's a plausible way to overreach. Migrations, public API changes and config changes are flagged.           | Out of scope in description; flags in design      |
| 5   | **Size**                | Fits in one PR and one agent session. If not, split it. An epic is never ready.                                                                | type; the split is recorded with `br dep add`     |
| 6   | **Dependencies**        | Each dependency exists and is expected to close first, or the ticket says what to stub.                                                        | dependencies                                      |
| 7   | **No open decisions**   | Every "should we X or Y?" is answered, with the answer written down.                                                                           | design                                            |
| 8   | **Constraints**         | Performance, compatibility, security, "don't touch X", where they apply.                                                                       | design or `## Boundaries` in description          |
| 9   | **Autonomy boundaries** | Anything _specific to this ticket_ the agent must stop and send back on. The default rule always applies, so only exceptions are written down. | `## Boundaries` in description                    |

## Default blocking rule (used by pickup)

An implementing agent sends a ticket back (`needs-clarification`) only when a gap would
change **public behavior, data, or scope**. For anything else, it states its assumption in
a comment and continues. `## Boundaries` can tighten this rule for a ticket.

## Ticket-type questions

These are prompts for refinement, not required sections. Ask only the ones that apply.

- **bug:** steps to reproduce; expected vs. actual; environment/version; is there a
  regression test to add?
- **feature:** who uses it and from where in the UI; affected interfaces (Tauri commands,
  stores, components); empty, error and loading states.
- **task / chore:** what "done" means concretely; anything that must keep working
  unchanged.
- **major dependency upgrade** (npm, Cargo or any other): the ticket's design must require
  reading the release notes / changelog for every major version crossed (e.g. 15 → 20
  means 16, 17, 18, 19 and 20) and checking each breaking change against how the repo
  actually uses the package, before changing anything. An acceptance criterion requires
  the completion note to list each breaking change as "affects us" (with file refs) or
  "doesn't affect us" (with a reason).
