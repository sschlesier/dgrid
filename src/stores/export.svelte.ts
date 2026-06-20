// Export Store - Per-tab CSV export state management with Svelte 5 runes
// Uses Tauri dialog for save picker, invoke for export, and events for progress.

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import { parseQuery } from '../lib/queries.js';
import { ApiError } from '../api/client';
import { appStore } from './app.svelte';

export type ExportMode = 'file' | 'clipboard';

const EXPORT_MODE_KEY = 'dgrid-export-mode';

function loadExportMode(): ExportMode {
  try {
    const stored = localStorage.getItem(EXPORT_MODE_KEY);
    if (stored === 'file' || stored === 'clipboard') {
      return stored;
    }
  } catch {
    // Ignore storage errors
  }
  return 'file';
}

function saveExportMode(mode: ExportMode): void {
  try {
    localStorage.setItem(EXPORT_MODE_KEY, mode);
  } catch {
    // Ignore storage errors
  }
}

interface ExportTabState {
  isExporting: boolean;
  exportedCount: number;
  totalCount: number;
  error: string | null;
}

interface ExportProgress {
  tabId: string;
  exportedCount: number;
  totalCount: number;
  done: boolean;
  error: string | null;
}

interface ExportCsvStringResponse {
  csv: string;
  exportedCount: number;
  truncated: boolean;
}

interface ExportStateOverrideEvent extends CustomEvent {
  detail: {
    tabId: string;
    state: ExportTabState;
  };
}

const DEFAULT_STATE: ExportTabState = {
  isExporting: false,
  exportedCount: 0,
  totalCount: 0,
  error: null,
};

class ExportStore {
  states = $state<Map<string, ExportTabState>>(new Map());
  mode = $state<ExportMode>(loadExportMode());

  getState(tabId: string): ExportTabState {
    return this.states.get(tabId) ?? DEFAULT_STATE;
  }

  private setState(tabId: string, state: ExportTabState): void {
    const newMap = new Map(this.states);
    newMap.set(tabId, state);
    this.states = newMap;
  }

  setMode(mode: ExportMode): void {
    this.mode = mode;
    saveExportMode(mode);
  }

  async startExport(
    tabId: string,
    connectionId: string,
    database: string,
    query: string,
    suggestedName: string
  ): Promise<void> {
    // Parse the query on the frontend
    const parsed = parseQuery(query);
    if (!parsed.ok) {
      throw new ApiError(400, 'QueryParseError', parsed.error.message);
    }

    // Open native save dialog
    const filePath = await save({
      defaultPath: suggestedName,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    });

    // User cancelled the picker
    if (!filePath) return;

    // Cancel any existing export for this tab
    await this.cancelExport(tabId);

    this.setState(tabId, {
      isExporting: true,
      exportedCount: 0,
      totalCount: 0,
      error: null,
    });

    // Listen for progress events
    let unlisten: UnlistenFn | undefined;
    try {
      unlisten = await listen<ExportProgress>('export-progress', (event) => {
        const progress = event.payload;
        if (progress.tabId !== tabId) return;

        this.setState(tabId, {
          isExporting: !progress.done,
          exportedCount: progress.exportedCount,
          totalCount: progress.totalCount,
          error: progress.error,
        });
      });

      await invoke('export_csv', {
        id: connectionId,
        request: {
          query: parsed.value,
          database,
          filePath,
          tabId,
        },
      });
    } catch (err) {
      // Check if this was a cancellation
      if (typeof err === 'string' && err.includes('cancelled')) {
        this.setState(tabId, { ...DEFAULT_STATE });
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      this.setState(tabId, {
        isExporting: false,
        exportedCount: 0,
        totalCount: 0,
        error: message,
      });
    } finally {
      unlisten?.();
    }
  }

  async exportToClipboard(connectionId: string, database: string, query: string): Promise<void> {
    const parsed = parseQuery(query);
    if (!parsed.ok) {
      appStore.notify('error', `Failed to copy to clipboard: ${parsed.error.message}`);
      return;
    }

    try {
      const res = await invoke<ExportCsvStringResponse>('export_csv_to_string', {
        id: connectionId,
        request: {
          query: parsed.value,
          database,
        },
      });

      await navigator.clipboard.writeText(res.csv);

      if (res.truncated) {
        appStore.notify(
          'warning',
          `Output truncated to 2 MB — copied ${res.exportedCount.toLocaleString()} rows to clipboard`
        );
      } else {
        appStore.notify(
          'success',
          `Copied ${res.exportedCount.toLocaleString()} rows to clipboard`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appStore.notify('error', `Failed to copy to clipboard: ${message}`);
    }
  }

  async cancelExport(tabId: string): Promise<void> {
    try {
      await invoke('cancel_export', { tabId });
    } catch {
      // Ignore errors from cancelling (e.g. no active export)
    }
  }

  cleanupTab(tabId: string): void {
    this.cancelExport(tabId);
    const newMap = new Map(this.states);
    newMap.delete(tabId);
    this.states = newMap;
  }
}

export const exportStore = new ExportStore();

if (typeof window !== 'undefined') {
  window.addEventListener('dgrid:e2e-set-export-state', (event: Event) => {
    const customEvent = event as ExportStateOverrideEvent;
    if (!customEvent.detail?.tabId || !customEvent.detail?.state) return;
    exportStore['setState'](customEvent.detail.tabId, customEvent.detail.state);
  });
}
