---
id: dgr-yq4c
status: open
deps: []
links: [dgr-mk2m]
created: 2026-09-27T01:52:40Z
type: chore
priority: 1
assignee: Scott Schlesier
tags: [stage:captured]
---

# Upgrade vitest to 4 to fix audit findings

vitest ^3 carries an audit finding that needs a major upgrade: >=4.1.11 clears it (5.x is also out). Split out of the pnpm audit ticket, which skips major upgrades.

Finding cleared:

- GHSA-82fw-gwwq-j7x9 — moderate (vitest and @vitest/mocker >=2.1.0 <4.1.11)

Upgrade @vitest/coverage-v8 to the same major. Dev only; not in the shipped bundle. Risk: vitest 4 changed config and mocking behavior, so vitest.config and tests under src/**tests**/ may need adjusting.
