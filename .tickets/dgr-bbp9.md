---
id: dgr-bbp9
status: open
deps: []
links: [dgr-mk2m]
created: 2026-09-27T01:37:17Z
type: chore
priority: 1
assignee: Scott Schlesier
tags: [stage:captured]
---

# Upgrade happy-dom to 20 to fix audit findings

happy-dom ^15 (the Vitest DOM environment, dev only) carries audit findings that need a major upgrade to 20.x (>=20.8.9 clears all three). Split out of the pnpm audit ticket, which skips major upgrades.

Findings cleared:

- GHSA-37j7-fg3j-429f — critical (<20.0.0)
- GHSA-6q6h-j7hj-3r64 — high (>=15.10.0 <=20.8.7)
- GHSA-w4gp-fjgq-3q4g — high (<20.8.9)

Risk: happy-dom 16–20 changed DOM behavior; component tests under src/**tests**/ may need adjusting.
