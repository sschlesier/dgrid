# Playwright E2E Tests — Preserved Reference Only

## Current status

These Playwright specs are not the active E2E path. The real-app suite now lives in `tests/webdriver/` and runs against the Tauri app through `tauri-webdriver`.

Use:

- `pnpm e2e` for the local real-app suite
- `pnpm e2e:ci` for the CI/Linux real-app suite

GitHub Actions runs the Linux path under `xvfb-run`.

## Why

These E2E tests were written for the pre-Tauri Node.js/Fastify backend. They use Playwright against the Vite dev server, but `invoke()` from `@tauri-apps/api` only works inside the Tauri webview runtime. When run against the standalone Vite dev server, every test that calls `invoke()` fails because there is no Tauri IPC bridge.

73 of 79 tests fail — only the smoke tests (which don't make backend calls) pass.

## What the tests cover

13 spec files with 79 tests covering full user journeys:

- **smoke** — app loads, keyboard shortcuts modal
- **connections** — create, test, connect
- **connection-crud** — edit, delete connections
- **sidebar-navigation** — expand tree, click collection, disconnect, refresh
- **query-execution** — find queries, Cmd+Enter, errors, pagination, status bar
- **field-editing** — edit values, change types, cancel
- **tab-management** — create/close tabs, independent state
- **results-views** — table/JSON/tree view switching, CSV export
- **query-history** — history entries, reload, clear
- **context-menu** — grid right-click menu actions, document delete
- **sidebar-context-menu** — sidebar right-click menu actions
- **multi-query** — multi-query execution modes
- **field-autocomplete** — editor field name completions

## What needs to happen to re-enable

Options for making E2E tests work with Tauri:

1. **Mock invoke layer** — Intercept `@tauri-apps/api/core` `invoke()` calls in the test environment and route them to a test backend (e.g., an in-process Express/Fastify server or direct MongoDB calls).

2. **tauri-driver / WebDriver** — Use Tauri's built-in WebDriver support (`tauri-driver`) to run tests against the real Tauri app. This is the most faithful approach but requires building the app first.

3. **Tauri-native testing** — Use `@tauri-apps/api/mocks` or a custom test harness that provides a fake IPC layer for Playwright to work against.

## Preserved assets

All specs, fixtures, selectors, and configuration are preserved as reference:

- `specs/` — all 13 spec files
- `fixtures.ts` — test fixtures and helpers
- `helpers/selectors.ts` — UI selectors
- `global-setup.ts` / `global-teardown.ts` — MongoDB memory server lifecycle
- `playwright.config.ts` — Playwright configuration (project root)
