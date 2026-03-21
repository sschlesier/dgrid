# Re-enable Real-App E2E via Cross-Platform Tauri WebDriver

## Summary

Replace the disabled browser-only Playwright path with a real-app E2E harness built around `tauri-plugin-webdriver` + `tauri-webdriver`, using WebdriverIO as the test runner. Optimize the first iteration for headed local runs on macOS and keep the design compatible with Linux CI. Preserve the existing Playwright suite as migration input, but only port the highest-value user journeys first so the harness can stabilize before expanding back to full coverage.

## Implementation Changes

### 1. Add a dedicated real-app E2E harness

- Create a new E2E harness for WebdriverIO-based tests rather than trying to retrofit `playwright.config.ts`.
- Add scripts for:
  - building or launching the Tauri app in test mode
  - starting `tauri-webdriver`
  - running headed macOS E2E locally
  - running Linux CI E2E
- Keep the current Playwright suite disabled during migration; do not delete it yet.

### 2. Enable WebDriver support in the Tauri app

- Add the Tauri WebDriver plugin to `src-tauri/Cargo.toml` and register it in `src-tauri/src/lib.rs`.
- Gate the plugin behind a dedicated test/E2E build path if the plugin should not ship in production bundles.
- Add a test-mode app configuration path that allows the harness to control:
  - frontend URL or bundled frontend target
  - temp data directory for `connections.json`
  - update-check disabling
  - any other behaviors that would create non-determinism in E2E
- Make the app test mode accept the same temp dir that the existing Playwright fixture flow already prepares, so connection cleanup and seeded state remain deterministic.

### 3. Replace browser `page.goto('/')` with real Tauri app launch

- Introduce a test bootstrap that starts:
  - `mongodb-memory-server`
  - the WebDriver intermediary (`tauri-webdriver`)
  - the Tauri app under test with the WebDriver plugin enabled
- Stop relying on the standalone Vite server as the test target; the app under test must be the real Tauri window.
- Resolve the current frontend port mismatch explicitly:
  - either standardize the app dev URL and test frontend port
  - or stop using a dev-server URL for E2E and test against a built frontend
- Prefer a single launch helper that hides OS-specific details and returns a ready WebDriver session.

### 4. Port the core Playwright behaviors to WebdriverIO

- Build a thin page-object/selector layer that mirrors the intent of `tests/e2e/helpers/selectors.ts`, but using WebdriverIO APIs.
- Recreate the shared fixture helpers from `tests/e2e/fixtures.ts`:
  - Mongo seeding and cleanup
  - connection file cleanup
  - connection creation
  - tree expansion
  - connect flow
- Port core coverage first:
  - smoke and app boot
  - connection create/test/connect
  - sidebar navigation into database and collection
  - query execution, invalid query handling, pagination
  - tab management if it is currently stable and low-cost to port
- Leave lower-priority flows for phase 2:
  - context menus
  - field editing
  - autocomplete
  - multi-query modes
  - export flows
  - full shortcut rebinding matrix

### 5. Make test mode deterministic

- Add an explicit E2E environment contract for the app:
  - temp data dir path
  - Mongo host/port
  - update checks disabled
  - dialogs or OS prompts either disabled or made predictable
- Ensure saved connections and test state write into an isolated temp directory, never the developer’s real app data.
- Keep one worker and serialized execution initially to avoid interference through shared app state and Mongo fixtures.

### 6. CI and platform rollout

- Phase 1 local target: headed macOS run for fast iteration.
- Phase 2 CI target: Linux job using the same WebDriver test suite with virtual display setup.
- Keep cross-platform conditionals inside the harness only; test specs should stay OS-agnostic.

## Public Interfaces / Contracts

- Add new npm scripts for real-app E2E, replacing the placeholder `e2e` commands in `package.json`.
- Add a Tauri test-mode configuration contract, likely environment-variable based, that the app reads on startup.
- Add a stable test harness API such as:
  - `startE2EStack()`
  - `stopE2EStack()`
  - `seedDatabase()`
  - `deleteAllConnections()`
  - `createConnection()`
- Keep the app’s production IPC surface unchanged unless test determinism requires a narrowly scoped test-only hook.

## Test Plan

- Harness verification:
  - WebDriver process starts and can create a session against the real Tauri app
  - app launches with isolated temp data dir
  - seeded Mongo instance is reachable from the app
- Core migrated scenarios:
  - app loads and main shell is visible
  - create connection via form
  - create connection via URI
  - test connection success/failure
  - connect and browse databases/collections
  - execute `find` query and render results
  - invalid query shows error
  - pagination works with 60+ seeded docs
  - status bar updates after query execution
- Stability checks:
  - repeated local runs do not leak connection state
  - teardown reliably kills Mongo, WebDriver, and app processes
  - macOS headed run works before attempting Linux CI rollout

## Assumptions and Defaults

- Runner choice is WebdriverIO, not Playwright, because the target transport is WebDriver and this is the lowest-risk fit for the researched Tauri path.
- Existing Playwright specs remain in the repo as references during migration; they are not part of the first runnable real-app suite.
- First milestone is a smaller, high-value real-app suite rather than immediate parity with all 79 preserved tests.
- Local developer workflow is macOS headed first; Linux CI is the next target once the harness is stable.
- The WebDriver plugin is enabled only for E2E/test builds unless later proven safe to leave compiled into all builds.

## Current Checkpoint

- Implemented:
  - isolated E2E app config for data dir, update-check disabling, and mock password storage
  - debug-build Tauri WebDriver plugin registration
  - WebdriverIO harness and launcher scripts
  - migrated smoke, connection-management, query-execution, tab-management, context-menu, field-editing, autocomplete, and export-ui specs
  - deterministic WebDriver shortcut-dispatch helper for global keyboard shortcut coverage in the Tauri webview
  - WebDriver query helpers updated to reliably clear and edit the prefilled collection query
  - keyboard-accessible grid-cell context-menu path for stable real-app E2E coverage
  - editor bridge hooks and WebDriver helpers for deterministic autocomplete popup interaction in the Tauri webview
  - editor bridge hooks for deterministic query text and cursor positioning in WebDriver tests
  - export-store test hook for deterministic progress-overlay coverage without relying on the native save dialog
  - WebdriverIO logger suppression for the known non-blocking `element/.../name` warning noise during passing runs
  - dedicated Linux GitHub Actions workflow for real-app E2E on pull requests, pushes to `main`, and manual dispatch
  - Linux CI workflow execution under Xvfb with Tauri/WebKit system dependencies and `tauri-webdriver` installation
  - CI-aware WebDriver harness timeout tuning and explicit app-path override support for Linux debugging
  - developer docs updated to point to `tests/webdriver/` as the active real-app suite and `pnpm e2e:ci` as the CI entrypoint
  - migrated multi-query and sidebar-context-menu specs into the real-app WebDriver suite
- Verified:
  - real-app smoke spec passes on macOS
  - real-app connection-management spec passes on macOS
  - real-app query-execution spec passes on macOS
  - real-app tab-management spec passes on macOS
  - real-app context-menu spec passes on macOS
  - real-app field-editing spec passes on macOS
  - real-app autocomplete spec passes on macOS
  - real-app export-ui spec passes on macOS
  - real-app multi-query spec passes on macOS
  - real-app sidebar-context-menu spec passes on macOS
  - real-app smoke spec now covers `?` opening the shortcuts modal and rebinding the `show-help` shortcut
  - current WebDriver suite (`pnpm e2e`) passes on macOS
  - Linux E2E workflow definition and CI entrypoint wiring are present in the repo
  - Linux E2E workflow passes on GitHub Actions for PR `#3`
  - `main` branch protection requires the `e2e-linux` status check
- Latest progress:
  - multi-query migration landed in commit `5aed6c9` (`Add webdriver coverage for multi-query execution`)
  - sidebar-context-menu migration landed in commit `2f27089` (`Add webdriver coverage for sidebar context menus`)
  - warning-suppression cleanup landed in commit `50ca81e` (`Suppress webdriver warning noise in e2e harness`)
  - Linux CI rollout landed in commits `90b9eb7`, `56c7df8`, `0c6d791`, and `7096526`
  - smoke shortcut parity landed with deterministic shortcut dispatch and restored `show-help` rebinding coverage
  - autocomplete popup parity landed in commit `a700f5c` (`Add popup autocomplete coverage to webdriver e2e`)
  - the current macOS WebDriver suite runs cleanly without the prior non-blocking `element/.../name` warning spam
  - GitHub Actions run `23104422380` completed successfully for PR `#3`
  - `main` branch protection now enforces the `e2e-linux` required check
- Remaining immediate work:
  - no immediate parity gaps remain in the current planned real-app WebDriver suite
