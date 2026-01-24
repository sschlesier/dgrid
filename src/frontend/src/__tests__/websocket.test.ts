import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileWatcher, getFileWatcher, watchFile, cleanup } from '../api/websocket';

// Mock WebSocket that tracks instances
const mockInstances: MockWebSocket[] = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN; // Start as OPEN for simplicity
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  private sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    mockInstances.push(this);
    // Immediately trigger onopen
    queueMicrotask(() => {
      this.onopen?.();
    });
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket not open');
    }
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  getSentMessages(): string[] {
    return this.sentMessages;
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

function getLastMockWebSocket(): MockWebSocket | undefined {
  return mockInstances[mockInstances.length - 1];
}

describe('FileWatcher', () => {
  beforeEach(() => {
    cleanup();
    mockInstances.length = 0;
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('connection', () => {
    it('connects to WebSocket server', async () => {
      const watcher = new FileWatcher('ws://localhost:3001/ws');
      watcher.connect();

      // Wait for microtask (onopen callback)
      await Promise.resolve();

      expect(watcher.isConnected).toBe(true);
      expect(getLastMockWebSocket()?.url).toBe('ws://localhost:3001/ws');
    });

    it('disconnects from WebSocket server', async () => {
      const watcher = new FileWatcher();
      watcher.connect();
      await Promise.resolve();

      watcher.disconnect();

      expect(watcher.isConnected).toBe(false);
    });

    it('does not reconnect when no watches exist', async () => {
      const watcher = new FileWatcher();
      watcher.connect();
      await Promise.resolve();

      const initialInstanceCount = mockInstances.length;

      // Simulate disconnect
      getLastMockWebSocket()?.close();

      // Should not create new WebSocket
      expect(mockInstances.length).toBe(initialInstanceCount);
    });
  });

  describe('watching', () => {
    it('sends watch message when connected', async () => {
      const watcher = new FileWatcher();
      const callback = vi.fn();

      watcher.connect();
      await Promise.resolve();

      watcher.watch('/test.js', callback);

      const messages = getLastMockWebSocket()?.getSentMessages();
      expect(messages).toContainEqual(JSON.stringify({ type: 'watch', path: '/test.js' }));
    });

    it('connects automatically when watching', async () => {
      const watcher = new FileWatcher();
      const callback = vi.fn();

      // Watch without explicit connect
      watcher.watch('/test.js', callback);
      await Promise.resolve();

      expect(watcher.isConnected).toBe(true);
    });

    it('sends unwatch message', async () => {
      const watcher = new FileWatcher();
      const callback = vi.fn();

      watcher.connect();
      await Promise.resolve();

      watcher.watch('/test.js', callback);
      watcher.unwatch('/test.js');

      const messages = getLastMockWebSocket()?.getSentMessages();
      expect(messages).toContainEqual(JSON.stringify({ type: 'unwatch', path: '/test.js' }));
    });

    it('tracks watched files', async () => {
      const watcher = new FileWatcher();
      const callback = vi.fn();

      watcher.watch('/test.js', callback);
      await Promise.resolve();

      expect(watcher.isWatching('/test.js')).toBe(true);
      expect(watcher.isWatching('/other.js')).toBe(false);

      watcher.unwatch('/test.js');
      expect(watcher.isWatching('/test.js')).toBe(false);
    });

    it('calls callback on file change', async () => {
      const watcher = new FileWatcher();
      const callback = vi.fn();

      watcher.connect();
      await Promise.resolve();

      watcher.watch('/test.js', callback);

      getLastMockWebSocket()?.simulateMessage({
        type: 'file-changed',
        path: '/test.js',
        content: 'new content',
      });

      expect(callback).toHaveBeenCalledWith('new content', '/test.js');
    });

    it('ignores file changes for unwatched paths', async () => {
      const watcher = new FileWatcher();
      const callback = vi.fn();

      watcher.connect();
      await Promise.resolve();

      watcher.watch('/test.js', callback);

      getLastMockWebSocket()?.simulateMessage({
        type: 'file-changed',
        path: '/other.js',
        content: 'new content',
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('handles multiple watches', async () => {
      const watcher = new FileWatcher();
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      watcher.connect();
      await Promise.resolve();

      watcher.watch('/test1.js', callback1);
      watcher.watch('/test2.js', callback2);

      getLastMockWebSocket()?.simulateMessage({
        type: 'file-changed',
        path: '/test1.js',
        content: 'content1',
      });

      getLastMockWebSocket()?.simulateMessage({
        type: 'file-changed',
        path: '/test2.js',
        content: 'content2',
      });

      expect(callback1).toHaveBeenCalledWith('content1', '/test1.js');
      expect(callback2).toHaveBeenCalledWith('content2', '/test2.js');
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
      await Promise.resolve();

      const watcher = getFileWatcher();
      expect(watcher.isWatching('/test.js')).toBe(true);

      unwatch();
      expect(watcher.isWatching('/test.js')).toBe(false);
    });

    it('cleanup resets singleton', async () => {
      const watcher1 = getFileWatcher();
      watcher1.connect();
      await Promise.resolve();

      cleanup();

      const watcher2 = getFileWatcher();
      expect(watcher2).not.toBe(watcher1);
    });
  });
});
