import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock systray2
vi.mock('systray2', () => ({
  default: vi.fn().mockImplementation(() => ({
    onClick: vi.fn(),
    kill: vi.fn(),
  })),
}));

// Note: We don't need to mock child_process since we're not testing openBrowser
// The browser.ts module is imported by index.ts but not directly called in these tests

import { initTray, cleanupTray } from '../tray/index.js';

describe('Tray', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initTray', () => {
    it('creates a tray context with systray instance', () => {
      const onQuit = vi.fn();
      const context = initTray(onQuit);

      expect(context.systray).toBeDefined();
      expect(context.onQuit).toBe(onQuit);
    });
  });

  describe('cleanupTray', () => {
    it('kills the systray and sets it to null', () => {
      const onQuit = vi.fn();
      const context = initTray(onQuit);
      const killSpy = vi.spyOn(context.systray!, 'kill');

      cleanupTray(context);

      expect(killSpy).toHaveBeenCalledWith(false);
      expect(context.systray).toBeNull();
    });

    it('does nothing if systray is already null', () => {
      const context = { systray: null, onQuit: vi.fn() };
      expect(() => cleanupTray(context)).not.toThrow();
    });
  });
});
