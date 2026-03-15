import { expect } from 'expect-webdriverio';
import { dispatchShortcut, resetApp, s } from '../helpers.mjs';

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

  it('? shortcut opens the keyboard shortcuts modal', async () => {
    await dispatchShortcut({ key: '?', code: 'Slash', shift: true });

    await expect(s.shortcutsModal.modal()).toBeDisplayed();
    await expect(s.shortcutsModal.heading()).toHaveText('Keyboard Shortcuts');

    await (await s.shortcutsModal.overlay()).click();
    await expect(s.shortcutsModal.modal()).not.toBeDisplayed();
  });

  it('rebinds the show-help shortcut via the modal', async () => {
    const modifier = process.platform === 'darwin' ? { meta: true } : { ctrl: true };

    await (await s.header.helpButton()).click();
    await expect(s.shortcutsModal.modal()).toBeDisplayed();

    await (await s.shortcutsModal.shortcutKeys('show-help')).click();
    await expect(s.shortcutsModal.captureZone()).toBeDisplayed();

    await dispatchShortcut({ key: 'h', code: 'KeyH', ...modifier });

    await expect(s.shortcutsModal.captureZone()).not.toExist();
    await expect(s.shortcutsModal.resetButton('show-help')).toExist();

    await browser.keys('Escape');
    await expect(s.shortcutsModal.modal()).not.toBeDisplayed();

    await dispatchShortcut({ key: '?', code: 'Slash', shift: true });
    await expect(s.shortcutsModal.modal()).not.toExist();

    await dispatchShortcut({ key: 'h', code: 'KeyH', ...modifier });
    await expect(s.shortcutsModal.modal()).toBeDisplayed();

    await expect(s.shortcutsModal.resetButton('show-help')).toExist();
    await browser.execute((el) => el.click(), await s.shortcutsModal.resetButton('show-help'));
    await expect(s.shortcutsModal.resetButton('show-help')).not.toExist();

    await browser.keys('Escape');
    await expect(s.shortcutsModal.modal()).not.toBeDisplayed();

    await dispatchShortcut({ key: '?', code: 'Slash', shift: true });
    await expect(s.shortcutsModal.modal()).toBeDisplayed();
  });

  it('does not show an update badge in E2E mode', async () => {
    await expect(s.header.updateBadge()).not.toExist();
  });
});
