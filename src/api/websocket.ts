// File watching via Tauri events (replaces WebSocket implementation)

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

type FileChangeCallback = (content: string, path: string) => void;

interface FileChangedEvent {
  path: string;
  content: string;
}

interface WatchEntry {
  path: string;
  callback: FileChangeCallback;
}

class FileWatcher {
  private watches = new Map<string, WatchEntry>();
  private unlisten: UnlistenFn | null = null;
  private listenerSetup = false;

  /**
   * Set up the global Tauri event listener for file-changed events.
   */
  private async ensureListener(): Promise<void> {
    if (this.listenerSetup) return;
    this.listenerSetup = true;

    this.unlisten = await listen<FileChangedEvent>('file-changed', (event) => {
      const { path, content } = event.payload;
      const entry = this.watches.get(path);
      if (entry) {
        entry.callback(content, path);
      }
    });
  }

  /**
   * Watch a file for changes.
   */
  async watch(path: string, callback: FileChangeCallback): Promise<void> {
    await this.ensureListener();

    this.watches.set(path, { path, callback });

    try {
      await invoke('watch_file', { path });
    } catch {
      // If backend watch fails, remove the local entry
      this.watches.delete(path);
    }
  }

  /**
   * Stop watching a file.
   */
  async unwatch(path: string): Promise<void> {
    this.watches.delete(path);

    try {
      await invoke('unwatch_file', { path });
    } catch {
      // Ignore errors on unwatch
    }
  }

  /**
   * Check if a file is being watched.
   */
  isWatching(path: string): boolean {
    return this.watches.has(path);
  }

  /**
   * Disconnect and clean up all watches.
   */
  async disconnect(): Promise<void> {
    // Unwatch all files on the backend
    const paths = [...this.watches.keys()];
    for (const path of paths) {
      try {
        await invoke('unwatch_file', { path });
      } catch {
        // Ignore
      }
    }

    this.watches.clear();

    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
      this.listenerSetup = false;
    }
  }
}

// Default instance
let defaultWatcher: FileWatcher | null = null;

/**
 * Get the default file watcher instance.
 */
export function getFileWatcher(): FileWatcher {
  if (!defaultWatcher) {
    defaultWatcher = new FileWatcher();
  }
  return defaultWatcher;
}

/**
 * Watch a file for changes. Returns a cleanup function.
 */
export function watchFile(path: string, callback: FileChangeCallback): () => void {
  const watcher = getFileWatcher();
  watcher.watch(path, callback);

  return () => {
    watcher.unwatch(path);
  };
}

/**
 * Cleanup - disconnect and reset.
 */
export function cleanup(): void {
  if (defaultWatcher) {
    defaultWatcher.disconnect();
    defaultWatcher = null;
  }
}

export { FileWatcher };
