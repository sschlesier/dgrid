# Cold read

A cold read tests whether a ticket can be implemented by an agent that knows **only the
ticket and the repo**. Run it in a fresh subagent (Agent tool, `general-purpose`) so no
conversation context leaks in. The subagent must not edit anything.

It's used in two places:
- **ticket-approve** (preview): advice for the human reviewer. It doesn't gate anything.
- **ticket-pickup** (gate): blocking questions send the ticket back to `needs-clarification`.

## Subagent prompt

Fill in `<TICKET_ID>` and `<REPO_PATH>`. Change nothing else, so results are comparable
over time.

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

## Interpreting the result

- Any BLOCKING entry means the verdict is blocked, whatever VERDICT says.
- Many ASSUMPTIONS on one ticket is a warning sign, even if it passes. Mention it.
- SPEC ISSUES are worth fixing at refine time, but they don't block on their own unless
  they fall under the blocking rule.
