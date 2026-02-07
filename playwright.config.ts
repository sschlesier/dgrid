import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:5173',
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
      // Use wrapper so backend receives DGRID_DATA_DIR from .mongo-info.json (globalSetup
      // runs in a separate process, so the runner never has that env when starting webServer).
      command: 'node tests/e2e/run-backend-e2e.js',
      url: 'http://127.0.0.1:3001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'pnpm dev:frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
