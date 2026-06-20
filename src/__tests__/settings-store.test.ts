import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage before importing the store (same pattern as keybindings-store.test.ts)
const mockStorage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockStorage.set(key, value),
  removeItem: (key: string) => mockStorage.delete(key),
});

// Must import after mocks are in place
const { settingsStore, DEFAULT_QUERY_SUFFIX } = await import('../stores/settings.svelte');

describe('SettingsStore', () => {
  beforeEach(() => {
    mockStorage.clear();
    settingsStore.resetDefaultQuery();
  });

  describe('effectiveDefaultQuery', () => {
    it('returns DEFAULT_QUERY_SUFFIX when no custom value is set', () => {
      expect(settingsStore.effectiveDefaultQuery).toBe(DEFAULT_QUERY_SUFFIX);
    });

    it('returns DEFAULT_QUERY_SUFFIX when value is empty string', () => {
      settingsStore.setDefaultQuery('');
      expect(settingsStore.effectiveDefaultQuery).toBe(DEFAULT_QUERY_SUFFIX);
    });

    it('returns DEFAULT_QUERY_SUFFIX when value is whitespace only', () => {
      settingsStore.setDefaultQuery('   ');
      expect(settingsStore.effectiveDefaultQuery).toBe(DEFAULT_QUERY_SUFFIX);
    });

    it('returns custom value when set', () => {
      settingsStore.setDefaultQuery('.find({})');
      expect(settingsStore.effectiveDefaultQuery).toBe('.find({})');
    });
  });

  describe('setDefaultQuery', () => {
    it('updates defaultQuery', () => {
      settingsStore.setDefaultQuery('.find({}).limit(10)');
      expect(settingsStore.defaultQuery).toBe('.find({}).limit(10)');
    });

    it('persists value to localStorage', () => {
      settingsStore.setDefaultQuery('.aggregate([])');
      expect(mockStorage.get('dgrid-default-query')).toBe('.aggregate([])');
    });

    it('overwrites a previously saved value', () => {
      settingsStore.setDefaultQuery('.find({})');
      settingsStore.setDefaultQuery('.find({}).sort({ _id: 1 })');
      expect(mockStorage.get('dgrid-default-query')).toBe('.find({}).sort({ _id: 1 })');
      expect(settingsStore.defaultQuery).toBe('.find({}).sort({ _id: 1 })');
    });
  });

  describe('resetDefaultQuery', () => {
    it('clears defaultQuery to empty string', () => {
      settingsStore.setDefaultQuery('.find({})');
      settingsStore.resetDefaultQuery();
      expect(settingsStore.defaultQuery).toBe('');
    });

    it('clears localStorage entry', () => {
      settingsStore.setDefaultQuery('.find({})');
      settingsStore.resetDefaultQuery();
      expect(mockStorage.get('dgrid-default-query')).toBe('');
    });

    it('falls back to DEFAULT_QUERY_SUFFIX after reset', () => {
      settingsStore.setDefaultQuery('.find({})');
      settingsStore.resetDefaultQuery();
      expect(settingsStore.effectiveDefaultQuery).toBe(DEFAULT_QUERY_SUFFIX);
    });
  });
});
