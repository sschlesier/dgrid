// Export Store - Per-tab CSV export state management with Svelte 5 runes

import * as api from '../api/client';

// eslint-disable-next-line no-undef
const CSV_FILE_TYPES: FilePickerAcceptType[] = [
  { description: 'CSV Files', accept: { 'text/csv': ['.csv'] } },
];

interface ExportTabState {
  isExporting: boolean;
  exportedCount: number;
  totalCount: number;
  error: string | null;
}

const DEFAULT_STATE: ExportTabState = {
  isExporting: false,
  exportedCount: 0,
  totalCount: 0,
  error: null,
};

class ExportStore {
  states = $state<Map<string, ExportTabState>>(new Map());
  private abortControllers: Map<string, AbortController> = new Map();

  getState(tabId: string): ExportTabState {
    return this.states.get(tabId) ?? DEFAULT_STATE;
  }

  private setState(tabId: string, state: ExportTabState): void {
    const newMap = new Map(this.states);
    newMap.set(tabId, state);
    this.states = newMap;
  }

  async startExport(
    tabId: string,
    connectionId: string,
    database: string,
    query: string,
    suggestedName: string
  ): Promise<void> {
    // Open file picker FIRST (before HTTP request, so cancel is free)
    let fileHandle: FileSystemFileHandle;
    try {
      fileHandle = await window.showSaveFilePicker({
        types: CSV_FILE_TYPES,
        suggestedName,
      });
    } catch (err) {
      // User cancelled the picker
      if (err instanceof DOMException && err.name === 'AbortError') return;
      throw err;
    }

    // Cancel any existing export for this tab
    this.cancelExport(tabId);

    const abortController = new AbortController();
    this.abortControllers.set(tabId, abortController);

    this.setState(tabId, {
      isExporting: true,
      exportedCount: 0,
      totalCount: 0,
      error: null,
    });

    try {
      const response = await api.exportCsv(
        connectionId,
        { query, database },
        { signal: abortController.signal }
      );

      const totalCount = parseInt(response.headers.get('X-Total-Count') ?? '0', 10);
      this.setState(tabId, {
        isExporting: true,
        exportedCount: 0,
        totalCount,
        error: null,
      });

      if (!response.body) {
        throw new Error('No response body');
      }

      // Pipe response body to file via writable stream
      const writable = await fileHandle.createWritable();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let exportedCount = 0;
      let lastUpdate = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          await writable.write(value);

          // Count newlines for progress (each newline = one row, minus header)
          const text = decoder.decode(value, { stream: true });
          for (let i = 0; i < text.length; i++) {
            if (text[i] === '\n') exportedCount++;
          }

          // Throttle state updates to every ~200ms
          const now = Date.now();
          if (now - lastUpdate > 200) {
            // Subtract 1 for header row
            const docCount = Math.max(0, exportedCount - 1);
            this.setState(tabId, {
              isExporting: true,
              exportedCount: docCount,
              totalCount,
              error: null,
            });
            lastUpdate = now;
          }
        }
      } finally {
        await writable.close();
      }

      // Final state update
      this.setState(tabId, {
        isExporting: false,
        exportedCount: Math.max(0, exportedCount - 1),
        totalCount,
        error: null,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.setState(tabId, { ...DEFAULT_STATE });
        return;
      }

      this.setState(tabId, {
        isExporting: false,
        exportedCount: 0,
        totalCount: 0,
        error: (err as Error).message,
      });
    } finally {
      this.abortControllers.delete(tabId);
    }
  }

  cancelExport(tabId: string): void {
    const controller = this.abortControllers.get(tabId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(tabId);
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
