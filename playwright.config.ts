import { defineConfig, devices } from '@playwright/test';

// Use separate ports for E2E so tests don't conflict with the dev server
const E2E_BACKEND_PORT = 3002;
const E2E_FRONTEND_PORT = 5174;
process.env.DGRID_PORT = String(E2E_BACKEND_PORT);
process.env.DGRID_FRONTEND_PORT = String(E2E_FRONTEND_PORT);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',

  use: {
    baseURL: `http://localhost:${E2E_FRONTEND_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },

  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

  webServer: [
    {
      // Wrapper starts mongodb-memory-server then launches backend with DGRID_DATA_DIR.
      // Needs extra timeout for MongoDB download/startup on first run.
      command: 'node tests/e2e/run-backend-e2e.js',
      url: `http://127.0.0.1:${E2E_BACKEND_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm dev:frontend',
      url: `http://localhost:${E2E_FRONTEND_PORT}`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
