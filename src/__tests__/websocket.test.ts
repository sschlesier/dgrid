import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileWatcher, getFileWatcher, watchFile, cleanup } from '../api/websocket';

// Mock Tauri APIs
const mockInvoke = vi.fn();
const mockListen = vi.fn();
let mockUnlisten = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

describe('FileWatcher (Tauri events)', () => {
  beforeEach(() => {
    cleanup();
    mockInvoke.mockReset();
    mockListen.mockReset();
    mockUnlisten = vi.fn();
    mockListen.mockResolvedValue(mockUnlisten);
    mockInvoke.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  describe('watching', () => {
    it('invokes watch_file on the backend', async () => {
      const watcher = new FileWatcher();
      const callback = vi.fn();

      await watcher.watch('/test.js', callback);

      expect(mockInvoke).toHaveBeenCalledWith('watch_file', { path: '/test.js' });
    });

    it('sets up Tauri event listener on first watch', async () => {
      const watcher = new FileWatcher();
      const callback = vi.fn();

      await watcher.watch('/test.js', callback);

      expect(mockListen).toHaveBeenCalledWith('file-changed', expect.any(Function));
    });

    it('only sets up listener once for multiple watches', async () => {
      const watcher = new FileWatcher();

      await watcher.watch('/test1.js', vi.fn());
      await watcher.watch('/test2.js', vi.fn());

      expect(mockListen).toHaveBeenCalledTimes(1);
    });

    it('invokes unwatch_file on the backend', async () => {
      const watcher = new FileWatcher();
      const callback = vi.fn();

      await watcher.watch('/test.js', callback);
      mockInvoke.mockClear();

      await watcher.unwatch('/test.js');

      expect(mockInvoke).toHaveBeenCalledWith('unwatch_file', { path: '/test.js' });
    });

    it('tracks watched files', async () => {
      const watcher = new FileWatcher();
      const callback = vi.fn();

      await watcher.watch('/test.js', callback);

      expect(watcher.isWatching('/test.js')).toBe(true);
      expect(watcher.isWatching('/other.js')).toBe(false);

      await watcher.unwatch('/test.js');
      expect(watcher.isWatching('/test.js')).toBe(false);
    });

    it('calls callback on file change event', async () => {
      const watcher = new FileWatcher();
      const callback = vi.fn();

      await watcher.watch('/test.js', callback);

      // Get the event handler that was passed to listen()
      const eventHandler = mockListen.mock.calls[0][1];

      // Simulate a file-changed event
      eventHandler({ payload: { path: '/test.js', content: 'new content' } });

      expect(callback).toHaveBeenCalledWith('new content', '/test.js');
    });

    it('ignores file changes for unwatched paths', async () => {
      const watcher = new FileWatcher();
      const callback = vi.fn();

      await watcher.watch('/test.js', callback);

      const eventHandler = mockListen.mock.calls[0][1];

      eventHandler({ payload: { path: '/other.js', content: 'new content' } });

      expect(callback).not.toHaveBeenCalled();
    });

    it('handles multiple watches with independent callbacks', async () => {
      const watcher = new FileWatcher();
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      await watcher.watch('/test1.js', callback1);
      await watcher.watch('/test2.js', callback2);

      const eventHandler = mockListen.mock.calls[0][1];

      eventHandler({ payload: { path: '/test1.js', content: 'content1' } });
      eventHandler({ payload: { path: '/test2.js', content: 'content2' } });

      expect(callback1).toHaveBeenCalledWith('content1', '/test1.js');
      expect(callback2).toHaveBeenCalledWith('content2', '/test2.js');
    });

    it('removes local entry if backend watch fails', async () => {
      const watcher = new FileWatcher();
      mockInvoke.mockRejectedValueOnce('File not found');

      await watcher.watch('/test.js', vi.fn());

      expect(watcher.isWatching('/test.js')).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('unwatches all files on disconnect', async () => {
      const watcher = new FileWatcher();

      await watcher.watch('/test1.js', vi.fn());
      await watcher.watch('/test2.js', vi.fn());
      mockInvoke.mockClear();

      await watcher.disconnect();

      expect(mockInvoke).toHaveBeenCalledWith('unwatch_file', { path: '/test1.js' });
      expect(mockInvoke).toHaveBeenCalledWith('unwatch_file', { path: '/test2.js' });
    });

    it('calls unlisten on disconnect', async () => {
      const watcher = new FileWatcher();

      await watcher.watch('/test.js', vi.fn());
      await watcher.disconnect();

      expect(mockUnlisten).toHaveBeenCalled();
    });

    it('clears all watches on disconnect', async () => {
      const watcher = new FileWatcher();

      await watcher.watch('/test.js', vi.fn());
      await watcher.disconnect();

      expect(watcher.isWatching('/test.js')).toBe(false);
    });
  });

  describe('module exports', () => {
    it('getFileWatcher returns singleton', () => {
      const watcher1 = getFileWatcher();
      const watcher2 = getFileWatcher();
      expect(watcher1).toBe(watcher2);
    });

    it('watchFile returns cleanup function', async () => {
      const callback = vi.fn();

      const unwatch = watchFile('/test.js', callback);
      // Allow the async watch to complete
      await vi.waitFor(() => {
        expect(getFileWatcher().isWatching('/test.js')).toBe(true);
      });

      unwatch();
      // Allow the async unwatch to complete
      await vi.waitFor(() => {
        expect(getFileWatcher().isWatching('/test.js')).toBe(false);
      });
    });

    it('cleanup resets singleton', async () => {
      const watcher1 = getFileWatcher();
      await watcher1.watch('/test.js', vi.fn());

      cleanup();

      const watcher2 = getFileWatcher();
      expect(watcher2).not.toBe(watcher1);
    });
  });
});
