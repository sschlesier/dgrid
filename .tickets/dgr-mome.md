---
id: dgr-mome
status: open
deps: [dgr-keqg, dgr-0ugm, dgr-nebk]
links: []
created: 2026-09-26T23:41:40Z
type: epic
priority: 1
assignee: Scott Schlesier
tags: [stage:captured]
---

# Retire the Playwright E2E suite

The repo has one E2E suite (WebdriverIO against the Tauri app, tests/webdriver/) and no Playwright code, dependencies or docs left over to mislead contributors or agents.

Context: the Playwright suite in tests/e2e/ was written for the pre-Tauri Node backend and no longer runs. All 13 of its specs have WebdriverIO counterparts in tests/webdriver/specs/. AGENTS.md was updated in 847ed66; the rest is tracked by the child tickets.
