import { test, expect } from '../fixtures';

test.describe('Smoke Tests', () => {
  test('backend health check returns ok', async ({ request }) => {
    const port = process.env.DGRID_PORT || '3001';
    const response = await request.get(`http://127.0.0.1:${port}/health`);
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('ok');
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

  test('rebind a keyboard shortcut via modal', async ({ page, s }) => {
    await page.goto('/');

    // Open modal
    await s.header.helpButton().click();
    await expect(s.shortcutsModal.modal()).toBeVisible();

    // Click on the show-help shortcut keys to start editing
    await s.shortcutsModal.shortcutKeys('show-help').click();
    await expect(s.shortcutsModal.captureZone()).toBeVisible();

    // Press a new key (Cmd+H)
    await page.keyboard.press('Meta+h');

    // Capture zone should disappear, shortcut should be updated
    await expect(s.shortcutsModal.captureZone()).not.toBeVisible();

    // Reset button should appear for the customized shortcut
    await s.shortcutsModal.shortcutKeys('show-help').hover();
    await expect(s.shortcutsModal.resetButton('show-help')).toBeVisible();

    // Close modal
    await page.keyboard.press('Escape');
    await expect(s.shortcutsModal.modal()).not.toBeVisible();

    // The old shortcut (?) should no longer open the modal
    await page.keyboard.type('?');
    await expect(s.shortcutsModal.modal()).not.toBeVisible();

    // The new shortcut (Cmd+H) should open the modal
    await page.keyboard.press('Meta+h');
    await expect(s.shortcutsModal.modal()).toBeVisible();

    // Reset to default and verify
    await s.shortcutsModal.shortcutKeys('show-help').hover();
    await s.shortcutsModal.resetButton('show-help').click();

    // Close and verify ? works again
    await page.keyboard.press('Escape');
    await page.keyboard.type('?');
    await expect(s.shortcutsModal.modal()).toBeVisible();
  });
});
