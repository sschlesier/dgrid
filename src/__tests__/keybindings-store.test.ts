import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage before importing the store
const mockStorage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockStorage.set(key, value),
  removeItem: (key: string) => mockStorage.delete(key),
});

// Mock formatShortcut to avoid navigator dependency in unit tests
vi.mock('../utils/keyboard', () => ({
  formatShortcut: (s: { key: string; meta?: boolean; shift?: boolean; alt?: boolean }) => {
    const parts: string[] = [];
    if (s.meta) parts.push('⌘');
    if (s.shift) parts.push('⇧');
    if (s.alt) parts.push('⌥');
    const keyMap: Record<string, string> = { enter: '↵' };
    parts.push(keyMap[s.key.toLowerCase()] || s.key.toUpperCase());
    return parts.join('');
  },
}));

// Must import after mocks are in place
const { keybindingsStore, SHORTCUT_DEFINITIONS } = await import('../stores/keybindings.svelte');

describe('KeybindingsStore', () => {
  beforeEach(() => {
    mockStorage.clear();
    keybindingsStore.resetAll();
  });

  describe('definitions', () => {
    it('exposes all shortcut definitions', () => {
      expect(keybindingsStore.definitions.length).toBe(SHORTCUT_DEFINITIONS.length);
      expect(keybindingsStore.definitions[0].id).toBe('show-help');
    });
  });

  describe('getBinding', () => {
    it('returns default binding when no override', () => {
      const binding = keybindingsStore.getBinding('show-help');
      expect(binding).toEqual({ key: '?' });
    });

    it('returns override when set', () => {
      keybindingsStore.setBinding('show-help', { key: 'h', meta: true });
      const binding = keybindingsStore.getBinding('show-help');
      expect(binding).toEqual({ key: 'h', meta: true });
    });

    it('throws for unknown id', () => {
      expect(() => keybindingsStore.getBinding('nonexistent')).toThrow('Unknown shortcut id');
    });
  });

  describe('getFormatted', () => {
    it('returns formatted default binding', () => {
      const formatted = keybindingsStore.getFormatted('new-tab');
      expect(formatted).toBe('⌥T');
    });

    it('returns formatted override binding', () => {
      keybindingsStore.setBinding('new-tab', { key: 'n', meta: true, shift: true });
      const formatted = keybindingsStore.getFormatted('new-tab');
      expect(formatted).toBe('⌘⇧N');
    });
  });

  describe('isCustomized', () => {
    it('returns false for default binding', () => {
      expect(keybindingsStore.isCustomized('show-help')).toBe(false);
    });

    it('returns true after setBinding', () => {
      keybindingsStore.setBinding('show-help', { key: 'h', meta: true });
      expect(keybindingsStore.isCustomized('show-help')).toBe(true);
    });

    it('returns false after resetBinding', () => {
      keybindingsStore.setBinding('show-help', { key: 'h', meta: true });
      keybindingsStore.resetBinding('show-help');
      expect(keybindingsStore.isCustomized('show-help')).toBe(false);
    });
  });

  describe('setBinding', () => {
    it('persists to localStorage', () => {
      keybindingsStore.setBinding('show-help', { key: 'h', meta: true });
      const stored = JSON.parse(mockStorage.get('dgrid-keybindings')!);
      expect(stored['show-help']).toEqual({ key: 'h', meta: true });
    });

    it('removes override when binding matches default', () => {
      keybindingsStore.setBinding('show-help', { key: 'h', meta: true });
      expect(keybindingsStore.isCustomized('show-help')).toBe(true);

      // Set back to default
      keybindingsStore.setBinding('show-help', { key: '?' });
      expect(keybindingsStore.isCustomized('show-help')).toBe(false);
    });
  });

  describe('resetBinding', () => {
    it('removes override for a single shortcut', () => {
      keybindingsStore.setBinding('show-help', { key: 'h', meta: true });
      keybindingsStore.setBinding('new-tab', { key: 'n', meta: true });

      keybindingsStore.resetBinding('show-help');

      expect(keybindingsStore.isCustomized('show-help')).toBe(false);
      expect(keybindingsStore.isCustomized('new-tab')).toBe(true);
    });

    it('is a no-op for non-customized shortcut', () => {
      keybindingsStore.resetBinding('show-help');
      expect(keybindingsStore.isCustomized('show-help')).toBe(false);
    });
  });

  describe('resetAll', () => {
    it('clears all overrides', () => {
      keybindingsStore.setBinding('show-help', { key: 'h', meta: true });
      keybindingsStore.setBinding('new-tab', { key: 'n', meta: true });

      keybindingsStore.resetAll();

      expect(keybindingsStore.isCustomized('show-help')).toBe(false);
      expect(keybindingsStore.isCustomized('new-tab')).toBe(false);
    });

    it('removes localStorage entry', () => {
      keybindingsStore.setBinding('show-help', { key: 'h', meta: true });
      keybindingsStore.resetAll();
      expect(mockStorage.has('dgrid-keybindings')).toBe(false);
    });
  });

  describe('findConflict', () => {
    it('returns null when no conflict', () => {
      const result = keybindingsStore.findConflict('show-help', { key: 'x', meta: true });
      expect(result).toBeNull();
    });

    it('finds conflict with another shortcut default', () => {
      // new-tab default is { key: 't', alt: true }
      const result = keybindingsStore.findConflict('show-help', { key: 't', alt: true });
      expect(result).toBe('new-tab');
    });

    it('finds conflict with another shortcut override', () => {
      keybindingsStore.setBinding('new-tab', { key: 'x', meta: true });
      const result = keybindingsStore.findConflict('show-help', { key: 'x', meta: true });
      expect(result).toBe('new-tab');
    });

    it('excludes the specified shortcut from conflict check', () => {
      // show-help default is { key: '?' }
      const result = keybindingsStore.findConflict('show-help', { key: '?' });
      expect(result).toBeNull();
    });
  });
});
