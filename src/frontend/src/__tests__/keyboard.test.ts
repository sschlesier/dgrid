import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isMac,
  matchesShortcut,
  formatShortcut,
  registerShortcut,
  unregisterShortcut,
  unregisterAllShortcuts,
  cleanup,
} from '../utils/keyboard';

describe('keyboard utilities', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('isMac', () => {
    it('returns true for Mac platform', () => {
      vi.stubGlobal('navigator', { platform: 'MacIntel' });
      expect(isMac()).toBe(true);
    });

    it('returns false for Windows platform', () => {
      vi.stubGlobal('navigator', { platform: 'Win32' });
      expect(isMac()).toBe(false);
    });

    it('returns false for Linux platform', () => {
      vi.stubGlobal('navigator', { platform: 'Linux x86_64' });
      expect(isMac()).toBe(false);
    });
  });

  describe('matchesShortcut', () => {
    it('matches simple key', () => {
      const event = new KeyboardEvent('keydown', { key: 't' });
      expect(matchesShortcut(event, { key: 't', handler: () => {} })).toBe(true);
    });

    it('matches key case-insensitively', () => {
      const event = new KeyboardEvent('keydown', { key: 'T' });
      expect(matchesShortcut(event, { key: 't', handler: () => {} })).toBe(true);
    });

    it('matches ctrl modifier on Windows', () => {
      vi.stubGlobal('navigator', { platform: 'Win32' });
      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true });
      expect(matchesShortcut(event, { key: 't', ctrl: true, handler: () => {} })).toBe(true);
    });

    it('matches meta modifier on Mac (Cmd key)', () => {
      vi.stubGlobal('navigator', { platform: 'MacIntel' });
      const event = new KeyboardEvent('keydown', { key: 't', metaKey: true });
      expect(matchesShortcut(event, { key: 't', meta: true, handler: () => {} })).toBe(true);
    });

    it('matches ctrl/meta as primary modifier on Windows', () => {
      vi.stubGlobal('navigator', { platform: 'Win32' });
      // On Windows, ctrl: true should match ctrlKey
      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true });
      expect(matchesShortcut(event, { key: 't', ctrl: true, handler: () => {} })).toBe(true);
    });

    it('matches shift modifier', () => {
      const event = new KeyboardEvent('keydown', { key: 't', shiftKey: true });
      expect(matchesShortcut(event, { key: 't', shift: true, handler: () => {} })).toBe(true);
    });

    it('matches alt modifier', () => {
      const event = new KeyboardEvent('keydown', { key: 't', altKey: true });
      expect(matchesShortcut(event, { key: 't', alt: true, handler: () => {} })).toBe(true);
    });

    it('does not match when modifier missing', () => {
      vi.stubGlobal('navigator', { platform: 'Win32' });
      const event = new KeyboardEvent('keydown', { key: 't' });
      expect(matchesShortcut(event, { key: 't', ctrl: true, handler: () => {} })).toBe(false);
    });

    it('does not match when extra modifier present', () => {
      vi.stubGlobal('navigator', { platform: 'Win32' });
      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true });
      expect(matchesShortcut(event, { key: 't', handler: () => {} })).toBe(false);
    });

    it('does not match different key', () => {
      const event = new KeyboardEvent('keydown', { key: 'w' });
      expect(matchesShortcut(event, { key: 't', handler: () => {} })).toBe(false);
    });
  });

  describe('formatShortcut', () => {
    describe('on Mac', () => {
      beforeEach(() => {
        vi.stubGlobal('navigator', { platform: 'MacIntel' });
      });

      it('formats Cmd+key', () => {
        expect(formatShortcut({ key: 't', meta: true })).toBe('⌘T');
      });

      it('formats Cmd+Shift+key', () => {
        expect(formatShortcut({ key: 't', meta: true, shift: true })).toBe('⌘⇧T');
      });

      it('formats Cmd+Alt+key', () => {
        expect(formatShortcut({ key: 't', meta: true, alt: true })).toBe('⌘⌥T');
      });

      it('formats special keys', () => {
        expect(formatShortcut({ key: 'enter', meta: true })).toBe('⌘↵');
        expect(formatShortcut({ key: 'escape' })).toBe('Esc');
        expect(formatShortcut({ key: 'arrowup', meta: true })).toBe('⌘↑');
      });
    });

    describe('on Windows/Linux', () => {
      beforeEach(() => {
        vi.stubGlobal('navigator', { platform: 'Win32' });
      });

      it('formats Ctrl+key', () => {
        expect(formatShortcut({ key: 't', ctrl: true })).toBe('Ctrl+T');
      });

      it('formats Ctrl+Shift+key', () => {
        expect(formatShortcut({ key: 't', ctrl: true, shift: true })).toBe('Ctrl+Shift+T');
      });

      it('formats Ctrl+Alt+key', () => {
        expect(formatShortcut({ key: 't', ctrl: true, alt: true })).toBe('Ctrl+Alt+T');
      });

      it('formats special keys', () => {
        expect(formatShortcut({ key: 'enter', ctrl: true })).toBe('Ctrl+↵');
        expect(formatShortcut({ key: 'escape' })).toBe('Esc');
      });
    });
  });

  describe('shortcut registration', () => {
    it('registers and triggers shortcut', () => {
      const handler = vi.fn();
      registerShortcut('test', { key: 't', ctrl: true, handler });

      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true });
      window.dispatchEvent(event);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('unregisters shortcut', () => {
      const handler = vi.fn();
      registerShortcut('test', { key: 't', ctrl: true, handler });
      unregisterShortcut('test');

      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true });
      window.dispatchEvent(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('unregisters all shortcuts', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      registerShortcut('test1', { key: 't', ctrl: true, handler: handler1 });
      registerShortcut('test2', { key: 'w', ctrl: true, handler: handler2 });
      unregisterAllShortcuts();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', ctrlKey: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true }));

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('replaces shortcut with same id', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      registerShortcut('test', { key: 't', ctrl: true, handler: handler1 });
      registerShortcut('test', { key: 't', ctrl: true, handler: handler2 });

      const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true });
      window.dispatchEvent(event);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });
});
