import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isMac,
  resolveKey,
  matchesShortcut,
  matchesBinding,
  bindingToCodeMirrorKey,
  bindingToShortcut,
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

  describe('resolveKey', () => {
    it('returns event.key for normal keys', () => {
      const event = new KeyboardEvent('keydown', { key: 't' });
      expect(resolveKey(event)).toBe('t');
    });

    it('returns event.key when alt is not pressed', () => {
      const event = new KeyboardEvent('keydown', { key: 't', metaKey: true });
      expect(resolveKey(event)).toBe('t');
    });

    it('resolves letter key from event.code when alt is pressed (macOS dead key)', () => {
      // On macOS, Alt+T produces † as event.key but code is still KeyT
      const event = new KeyboardEvent('keydown', { key: '†', altKey: true, code: 'KeyT' });
      expect(resolveKey(event)).toBe('t');
    });

    it('resolves digit key from event.code when alt is pressed', () => {
      const event = new KeyboardEvent('keydown', { key: '¡', altKey: true, code: 'Digit1' });
      expect(resolveKey(event)).toBe('1');
    });

    it('returns event.key for non-letter/digit codes when alt is pressed', () => {
      const event = new KeyboardEvent('keydown', { key: 'Enter', altKey: true, code: 'Enter' });
      expect(resolveKey(event)).toBe('Enter');
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

    it('matches alt modifier when macOS produces dead key character', () => {
      // On macOS, Alt+T produces † but code is KeyT
      const event = new KeyboardEvent('keydown', { key: '†', altKey: true, code: 'KeyT' });
      expect(matchesShortcut(event, { key: 't', alt: true, handler: () => {} })).toBe(true);
    });

    it('matches alt modifier when macOS produces dead key for W', () => {
      // On macOS, Alt+W produces ∑ but code is KeyW
      const event = new KeyboardEvent('keydown', { key: '∑', altKey: true, code: 'KeyW' });
      expect(matchesShortcut(event, { key: 'w', alt: true, handler: () => {} })).toBe(true);
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

    it('respects alwaysGlobal flag for input elements', () => {
      const handler = vi.fn();
      registerShortcut('global-test', { key: 'x', ctrl: true, alwaysGlobal: true, handler });

      // Create an input element and dispatch from it
      const input = document.createElement('input');
      document.body.appendChild(input);
      const event = new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true });
      input.dispatchEvent(event);
      document.body.removeChild(input);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('triggers alt shortcut with macOS dead key character', () => {
      const handler = vi.fn();
      registerShortcut('alt-test', { key: 't', alt: true, alwaysGlobal: true, handler });

      // Simulate macOS Alt+T producing †
      const event = new KeyboardEvent('keydown', {
        key: '†',
        altKey: true,
        code: 'KeyT',
        bubbles: true,
      });
      window.dispatchEvent(event);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does not fire non-global shortcut from input elements', () => {
      const handler = vi.fn();
      registerShortcut('local-test', { key: 'x', ctrl: true, handler });

      const input = document.createElement('input');
      document.body.appendChild(input);
      const event = new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true });
      input.dispatchEvent(event);
      document.body.removeChild(input);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('matchesBinding', () => {
    it('matches a simple binding', () => {
      const event = new KeyboardEvent('keydown', { key: '?' });
      expect(matchesBinding(event, { key: '?' })).toBe(true);
    });

    it('matches a binding with modifiers', () => {
      vi.stubGlobal('navigator', { platform: 'MacIntel' });
      const event = new KeyboardEvent('keydown', { key: 'e', metaKey: true });
      expect(matchesBinding(event, { key: 'e', meta: true })).toBe(true);
    });

    it('does not match when key differs', () => {
      const event = new KeyboardEvent('keydown', { key: 'a' });
      expect(matchesBinding(event, { key: 'b' })).toBe(false);
    });

    it('does not match when modifier differs', () => {
      vi.stubGlobal('navigator', { platform: 'MacIntel' });
      const event = new KeyboardEvent('keydown', { key: 'e' });
      expect(matchesBinding(event, { key: 'e', meta: true })).toBe(false);
    });

    it('matches alt binding when macOS produces dead key character', () => {
      const event = new KeyboardEvent('keydown', { key: '†', altKey: true, code: 'KeyT' });
      expect(matchesBinding(event, { key: 't', alt: true })).toBe(true);
    });
  });

  describe('bindingToCodeMirrorKey', () => {
    it('converts Mod+Enter', () => {
      expect(bindingToCodeMirrorKey({ key: 'enter', meta: true })).toBe('Mod-Enter');
    });

    it('converts Mod+Shift+Enter', () => {
      expect(bindingToCodeMirrorKey({ key: 'enter', meta: true, shift: true })).toBe(
        'Mod-Shift-Enter'
      );
    });

    it('converts Mod+Alt+Enter', () => {
      expect(bindingToCodeMirrorKey({ key: 'enter', meta: true, alt: true })).toBe('Mod-Alt-Enter');
    });

    it('converts plain letter key', () => {
      expect(bindingToCodeMirrorKey({ key: 's', meta: true })).toBe('Mod-s');
    });

    it('converts ctrl binding the same as meta', () => {
      expect(bindingToCodeMirrorKey({ key: 's', ctrl: true })).toBe('Mod-s');
    });
  });

  describe('bindingToShortcut', () => {
    it('creates a KeyboardShortcut from binding and handler', () => {
      const handler = vi.fn();
      const shortcut = bindingToShortcut({ key: 't', meta: true }, handler);
      expect(shortcut.key).toBe('t');
      expect(shortcut.meta).toBe(true);
      expect(shortcut.handler).toBe(handler);
    });

    it('passes alwaysGlobal option', () => {
      const handler = vi.fn();
      const shortcut = bindingToShortcut({ key: 't', meta: true }, handler, {
        alwaysGlobal: true,
      });
      expect(shortcut.alwaysGlobal).toBe(true);
    });
  });
});
