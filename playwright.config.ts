import { defineConfig, devices } from '@playwright/test';

// Use a separate port for E2E so tests don't conflict with the dev server
const E2E_FRONTEND_PORT = 5174;
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

  // Note: E2E tests need Tauri integration to work fully.
  // The frontend uses Tauri IPC (invoke) which requires the Tauri runtime.
  // MongoDB is started in globalSetup for data seeding.
  webServer: {
    command: 'pnpm dev:frontend',
    url: `http://localhost:${E2E_FRONTEND_PORT}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
