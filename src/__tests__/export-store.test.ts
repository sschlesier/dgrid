import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Tauri APIs before importing the store
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
}));

// Mock app store so notify() can be spied on
vi.mock('../stores/app.svelte', () => ({
  appStore: {
    notify: vi.fn(),
  },
}));

// Mock parseQuery
vi.mock('../lib/queries.js', () => ({
  parseQuery: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { appStore } from '../stores/app.svelte';
import { exportStore } from '../stores/export.svelte';
import { parseQuery } from '../lib/queries.js';

const mockedInvoke = invoke as ReturnType<typeof vi.fn>;
const mockedNotify = appStore.notify as ReturnType<typeof vi.fn>;
const mockedParseQuery = parseQuery as ReturnType<typeof vi.fn>;

describe('ExportStore — mode persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset mode to default for each test
    exportStore.setMode('file');
  });

  it('defaults to "file" mode', () => {
    expect(exportStore.mode).toBe('file');
  });

  it('setMode updates mode and persists to localStorage', () => {
    exportStore.setMode('clipboard');
    expect(exportStore.mode).toBe('clipboard');
    expect(localStorage.getItem('dgrid-export-mode')).toBe('clipboard');
  });

  it('setMode back to "file" persists correctly', () => {
    exportStore.setMode('clipboard');
    exportStore.setMode('file');
    expect(exportStore.mode).toBe('file');
    expect(localStorage.getItem('dgrid-export-mode')).toBe('file');
  });
});

describe('ExportStore — exportToClipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default parseQuery to succeed
    mockedParseQuery.mockReturnValue({
      ok: true,
      value: { type: 'collection', collection: 'users', operation: 'find' },
    });

    // Default clipboard mock (navigator.clipboard is getter-only, use defineProperty)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    });
  });

  it('invokes export_csv_to_string and writes to clipboard', async () => {
    mockedInvoke.mockResolvedValue({
      csv: '_id,name\n1,Alice\n',
      exportedCount: 1,
      truncated: false,
    });

    await exportStore.exportToClipboard('conn-1', 'testdb', 'db.users.find({})');

    expect(mockedInvoke).toHaveBeenCalledWith('export_csv_to_string', {
      id: 'conn-1',
      request: expect.objectContaining({ database: 'testdb' }),
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('_id,name\n1,Alice\n');
    expect(mockedNotify).toHaveBeenCalledWith('success', 'Copied 1 rows to clipboard');
  });

  it('shows warning notification when truncated', async () => {
    mockedInvoke.mockResolvedValue({
      csv: '_id,name\n1,Alice\n',
      exportedCount: 500,
      truncated: true,
    });

    await exportStore.exportToClipboard('conn-1', 'testdb', 'db.users.find({})');

    expect(mockedNotify).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('truncated to 2 MB')
    );
    expect(mockedNotify).toHaveBeenCalledWith('warning', expect.stringContaining('500'));
  });

  it('shows error notification on invoke failure', async () => {
    mockedInvoke.mockRejectedValue(new Error('Connection timeout'));

    await exportStore.exportToClipboard('conn-1', 'testdb', 'db.users.find({})');

    expect(mockedNotify).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Connection timeout')
    );
  });

  it('throws ApiError when query parse fails', async () => {
    mockedParseQuery.mockReturnValue({
      ok: false,
      error: { message: 'Invalid query syntax' },
    });

    await expect(
      exportStore.exportToClipboard('conn-1', 'testdb', 'invalid query')
    ).rejects.toThrow('Invalid query syntax');
  });
});
