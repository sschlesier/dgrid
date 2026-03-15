import { expect } from 'expect-webdriverio';
import { resetApp, s } from '../helpers.mjs';

describe('Smoke Tests', () => {
  beforeEach(async () => {
    await resetApp();
  });

  it('loads the app shell', async () => {
    await expect(s.header.root()).toBeDisplayed();
  });

  it('opens the keyboard shortcuts modal', async () => {
    await (await s.header.helpButton()).click();
    await expect(s.shortcutsModal.modal()).toBeDisplayed();
    await expect(s.shortcutsModal.heading()).toHaveText('Keyboard Shortcuts');
  });

  it('does not show an update badge in E2E mode', async () => {
    await expect(s.header.updateBadge()).not.toExist();
  });
});
