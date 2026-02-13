import { test, expect } from '../fixtures';

test.describe('Smoke Tests', () => {
  test('app loads with header and sidebar', async ({ page, s }) => {
    await page.goto('/');

    await expect(s.header.root()).toBeVisible();
    await expect(s.header.title()).toHaveText('DGrid');
    await expect(s.sidebar.root()).toBeVisible();
    await expect(s.sidebar.emptyState()).toBeVisible();
  });

  test('backend health check returns ok', async ({ request }) => {
    const port = process.env.DGRID_PORT || '3001';
    const response = await request.get(`http://127.0.0.1:${port}/health`);
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('connection dialog opens and closes', async ({ page, s }) => {
    await page.goto('/');

    // Open dialog
    await s.header.newConnectionButton().click();
    await expect(s.connectionDialog.overlay()).toBeVisible();
    await expect(s.connectionDialog.heading()).toHaveText('New Connection');

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(s.connectionDialog.overlay()).not.toBeVisible();
  });

  test('connection dialog has default values', async ({ page, s }) => {
    await page.goto('/');

    await s.header.newConnectionButton().click();
    await expect(s.connectionDialog.overlay()).toBeVisible();

    await expect(s.connectionDialog.hostInput()).toHaveValue('localhost');
    await expect(s.connectionDialog.portInput()).toHaveValue('27017');
    await expect(s.connectionDialog.nameInput()).toHaveValue('');
  });

  test('help button opens keyboard shortcuts modal', async ({ page, s }) => {
    await page.goto('/');

    // Click help button in header
    await s.header.helpButton().click();
    await expect(s.shortcutsModal.modal()).toBeVisible();
    await expect(s.shortcutsModal.heading()).toHaveText('Keyboard Shortcuts');

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(s.shortcutsModal.modal()).not.toBeVisible();
  });

  test('update badge is not shown in dev mode', async ({ page, s }) => {
    await page.goto('/');
    await expect(s.header.root()).toBeVisible();
    await expect(s.header.updateBadge()).not.toBeVisible();
  });

  test('? shortcut opens keyboard shortcuts modal', async ({ page, s }) => {
    await page.goto('/');

    // Press ? to open shortcuts modal
    await page.keyboard.type('?');
    await expect(s.shortcutsModal.modal()).toBeVisible();
    await expect(s.shortcutsModal.heading()).toHaveText('Keyboard Shortcuts');

    // Close by clicking overlay
    await s.shortcutsModal.overlay().click({ position: { x: 5, y: 5 } });
    await expect(s.shortcutsModal.modal()).not.toBeVisible();
  });
});
