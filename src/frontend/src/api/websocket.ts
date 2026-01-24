// WebSocket client for file watching

type FileChangeCallback = (content: string, path: string) => void;

interface WatchEntry {
  path: string;
  callback: FileChangeCallback;
}

interface WebSocketMessage {
  type: 'file-changed' | 'watch-ack' | 'unwatch-ack' | 'error';
  path?: string;
  content?: string;
  message?: string;
}

class FileWatcher {
  private socket: WebSocket | null = null;
  private watches = new Map<string, WatchEntry>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  private isConnecting = false;
  private pendingWatches: string[] = [];

  constructor(url: string = 'ws://localhost:3001/ws') {
    this.url = url;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;

        // Re-register any pending watches
        for (const path of this.pendingWatches) {
          this.sendWatch(path);
        }
        this.pendingWatches = [];

        // Re-register existing watches after reconnect
        for (const path of this.watches.keys()) {
          this.sendWatch(path);
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch {
          // Ignore invalid messages
        }
      };

      this.socket.onclose = () => {
        this.isConnecting = false;
        this.handleDisconnect();
      };

      this.socket.onerror = () => {
        this.isConnecting = false;
        // Error will trigger close event
      };
    } catch {
      this.isConnecting = false;
      this.handleDisconnect();
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.watches.clear();
    this.pendingWatches = [];
    this.reconnectAttempts = 0;
  }

  /**
   * Watch a file for changes
   */
  watch(path: string, callback: FileChangeCallback): void {
    this.watches.set(path, { path, callback });

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.sendWatch(path);
    } else {
      this.pendingWatches.push(path);
      this.connect();
    }
  }

  /**
   * Stop watching a file
   */
  unwatch(path: string): void {
    this.watches.delete(path);

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.sendUnwatch(path);
    }

    // Remove from pending if not yet sent
    const pendingIndex = this.pendingWatches.indexOf(path);
    if (pendingIndex !== -1) {
      this.pendingWatches.splice(pendingIndex, 1);
    }
  }

  /**
   * Check if a file is being watched
   */
  isWatching(path: string): boolean {
    return this.watches.has(path);
  }

  /**
   * Get the connection state
   */
  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private sendWatch(path: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'watch', path }));
    }
  }

  private sendUnwatch(path: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'unwatch', path }));
    }
  }

  private handleMessage(message: WebSocketMessage): void {
    if (message.type === 'file-changed' && message.path && message.content !== undefined) {
      const watch = this.watches.get(message.path);
      if (watch) {
        watch.callback(message.content, message.path);
      }
    }
  }

  private handleDisconnect(): void {
    this.socket = null;

    if (this.watches.size === 0 && this.pendingWatches.length === 0) {
      // No watches, don't reconnect
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      // Give up reconnecting
      return;
    }

    // Schedule reconnect with exponential backoff
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}

// Default instance
let defaultWatcher: FileWatcher | null = null;

/**
 * Get the default file watcher instance
 */
export function getFileWatcher(): FileWatcher {
  if (!defaultWatcher) {
    defaultWatcher = new FileWatcher();
  }
  return defaultWatcher;
}

/**
 * Watch a file for changes
 */
export function watchFile(path: string, callback: FileChangeCallback): () => void {
  const watcher = getFileWatcher();
  watcher.watch(path, callback);

  // Return cleanup function
  return () => {
    watcher.unwatch(path);
  };
}

/**
 * Cleanup - disconnect and reset
 */
export function cleanup(): void {
  if (defaultWatcher) {
    defaultWatcher.disconnect();
    defaultWatcher = null;
  }
}

export { FileWatcher };
