# Mystery: E2E Tests Hitting Rate Limit Despite Rate Limit Being Disabled

## Problem Summary

When running the full Playwright E2E suite (38 tests), the first 14 tests pass, then tests 15+ consistently fail with "Rate limit exceeded, retry in N seconds". This happens **even when `@fastify/rate-limit` is conditionally NOT registered**.

The same tests pass perfectly when run in isolation or in smaller groups.

## Architecture

- **Backend**: Fastify 5.x on port 3001, started via `tsx watch src/backend/server.ts`
- **Frontend**: Svelte/Vite on port 5173, with a proxy: `/api` → `http://127.0.0.1:3001`
- **Browser tests hit**: `http://localhost:5173` (Vite), which proxies API calls to backend
- **Playwright config**: `workers: 1`, `fullyParallel: false`, single chromium project

## How Playwright Starts Servers

```
globalSetup (global-setup.ts)
  → starts MongoMemoryServer
  → creates temp dir
  → sets process.env.DGRID_DATA_DIR = tempDir
  → writes .mongo-info.json

webServer[0]: pnpm dev:backend (tsx watch src/backend/server.ts)
  → inherits process.env including DGRID_DATA_DIR
  → waits for http://127.0.0.1:3001/health
  → reuseExistingServer: !process.env.CI (true locally)

webServer[1]: pnpm dev:frontend (vite)
  → waits for http://localhost:5173
  → reuseExistingServer: !process.env.CI (true locally)
```

## The Rate Limit Code (server.ts)

```typescript
if (!process.env.DGRID_DATA_DIR) {
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });
}
```

When `DGRID_DATA_DIR` is set (E2E mode), the rate-limit plugin is **not registered at all**.

## What I've Verified

1. **Env var is received**: Added `console.log` to server.ts — when starting manually with `DGRID_DATA_DIR=/tmp/test pnpm dev:backend`, it correctly logs `DGRID_DATA_DIR=/tmp/test` and `rate limit max=10000` (from an earlier attempt with conditional max).

2. **Tests pass in isolation**: Running just `query-execution.spec.ts` alone → 5/5 pass. Running `field-editing.spec.ts` + `query-execution.spec.ts` together → 9/9 pass.

3. **Failure is deterministic**: Always fails at test #15, which is the first test in `query-execution.spec.ts` when run after the preceding 14 tests (from connection-crud, connections, csv-export, field-editing specs).

4. **CI=true doesn't help**: Tried `CI=true pnpm e2e` (forces `reuseExistingServer: false`) — same failures.

5. **Killing all servers first doesn't help**: Verified ports 3001 and 5173 are free before starting — same failures.

6. **Error is always the same**: Screenshot shows "Rate limit exceeded, retry in 38 seconds" in the connection dialog — the POST to create a connection returns 429.

## Key Observations

- The error message "Rate limit exceeded, retry in X seconds" is the default `@fastify/rate-limit` response format.
- But we're NOT registering the plugin when `DGRID_DATA_DIR` is set!
- The failure always happens around the same point (~20-25 seconds into the run, after ~14 tests).
- There's no other rate limiting in the codebase (`grep -ri "rate.limit" src/` only finds server.ts).

## Hypothesis: `tsx watch` Server Restart

The backend runs via `tsx watch`, which restarts on file changes. Could `tsx watch` be:

1. Detecting file changes (test-results being written? `.mongo-info.json`?) during the test run
2. Restarting the server, causing it to re-read server.ts
3. On restart, somehow losing the `DGRID_DATA_DIR` env var or using a cached/stale version of the code?

But env vars should be inherited from the parent process on restart, and `tsx watch` shouldn't be watching `test-results/`.

## Another Hypothesis: Vite Proxy

The frontend uses Vite's built-in proxy (`/api` → `http://127.0.0.1:3001`). Could Vite's dev server itself be imposing rate limiting? Vite doesn't typically do this, but could there be some connection pooling or request queuing that manifests as rate limiting?

## Files

- `src/backend/server.ts` — Fastify server with conditional rate limit
- `playwright.config.ts` — Playwright config with webServer setup
- `tests/e2e/global-setup.ts` — Sets DGRID_DATA_DIR env var
- `vite.config.ts` — Vite config with `/api` proxy to backend
- `package.json` scripts: `dev:backend` = `tsx watch src/backend/server.ts`, `dev:frontend` = `vite`

## What I Need Help With

Why are these tests seeing "Rate limit exceeded" when the rate-limit plugin isn't even registered? What could cause this behavior where 14 tests work fine but the 15th always fails with rate limiting?

---

## Investigation Result: Root Cause

**The backend process never receives `DGRID_DATA_DIR` when started by Playwright.**

### Why

1. **`globalSetup` runs in a separate process.** Playwright runs the global setup file in its own Node process. When `global-setup.ts` sets `process.env.DGRID_DATA_DIR = tempDir`, that only affects that process. When the setup exits, that env is gone.

2. **`webServer` is started by the runner process.** In `node_modules/playwright/lib/plugins/webServerPlugin.js`, the web server is launched with:

   ```js
   env: {
     ...DEFAULT_ENVIRONMENT_VARIABLES,
     ...process.env,   // runner process env
     ...this._options.env
   }
   ```

   So the backend gets the **Playwright runner’s** `process.env`. The runner process never had `DGRID_DATA_DIR` set; only the global setup process did. Playwright may pass global-setup env into **test workers**, but the process that starts the webServer is the main runner, which does not get that env.

3. **So the backend always enables rate limit.** With `DGRID_DATA_DIR` unset, `server.ts` registers `@fastify/rate-limit` (100 req/min). After ~14 tests the suite crosses that limit and the next API call gets 429. That matches “first 14 pass, 15th fails” and the exact “Rate limit exceeded, retry in N seconds” message from the plugin.

### Why manual `DGRID_DATA_DIR=/tmp/test pnpm dev:backend` worked

When you run the backend manually with the env set, that process has `DGRID_DATA_DIR` and correctly skips the plugin. So the conditional logic in `server.ts` is correct; the issue is only that the E2E-started backend never receives the var.

---

## Suggestions

### 1. **E2E backend wrapper (recommended)**

Start the backend from a small script that reads `tests/e2e/.mongo-info.json` (written by global setup before webServer runs) and runs the backend with `DGRID_DATA_DIR` set. Use that script as the `webServer` command for the backend so the child process always has the var.

- **Pros:** No dependency on Playwright passing env; works regardless of runner vs worker process. Single source of truth (`.mongo-info.json`) for E2E.
- **Cons:** One extra script to maintain.

### 2. **Set `webServer[0].env` from a file in config**

Playwright’s `webServer` supports an `env` option. You could have global setup write `DGRID_DATA_DIR` (and optionally other E2E vars) to a small env file (e.g. `tests/e2e/.env.e2e`), and in `playwright.config.ts` read that file and set `webServer[0].env` for the backend. The catch: the config is loaded once at startup, and at that moment global setup hasn’t run yet, so the file doesn’t exist. You’d need to either use a **dynamic config** (e.g. `export default defineConfig(async () => { ... })`) that reads the file after global setup, or a wrapper that reads the file and then runs the backend (back to option 1). So option 1 is simpler.

### 3. **Backend detects E2E via a well-known file**

Have the backend check for something like `tests/e2e/.mongo-info.json` (path from `process.cwd()` or an env like `DGRID_E2E_MONGO_INFO_PATH`) at startup. If present, read `tempDir` and set `DATA_DIR` (and skip rate limit) from that. Then you don’t need to pass `DGRID_DATA_DIR` from Playwright at all. Downside: backend has to know about E2E paths/conventions.

### 4. **Rely on Playwright project dependencies instead of globalSetup**

If you switch to a “setup” project (e.g. a test file that runs first and writes `.mongo-info.json`) instead of `globalSetup`, the same process that runs tests might also run the setup, and env could be shared. This is a bigger change and may still not guarantee the webServer launcher runs in that same process; the wrapper (option 1) is more reliable.

---

**Recommendation:** Implement **option 1** (E2E wrapper script that reads `.mongo-info.json` and starts the backend with `DGRID_DATA_DIR`), and point the backend `webServer` entry at that script. That fixes the rate-limit mystery without changing backend semantics or depending on Playwright’s env propagation.
