/**
 * Playwright globalSetup runs AFTER webServer processes are started.
 * MongoDB is now bootstrapped by run-backend-e2e.js (the backend webServer wrapper),
 * so this file is intentionally minimal.
 */
async function globalSetup(): Promise<void> {
  // Nothing needed — MongoDB is started by run-backend-e2e.js
}

export default globalSetup;
