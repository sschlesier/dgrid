import type { LogEntry, LogLevel, LogSource } from '../types';

const MAX_LOG_ENTRIES = 100;

function generateId(): string {
  return crypto.randomUUID();
}

interface AppendLogInput {
  level: LogLevel;
  source: LogSource;
  message: string;
  connectionId?: string;
  connectionName?: string;
  tabId?: string;
  tabTitle?: string;
  timestamp?: string;
}

class LogStore {
  entries = $state<LogEntry[]>([]);

  append(input: AppendLogInput): LogEntry {
    const entry: LogEntry = {
      id: generateId(),
      timestamp: input.timestamp ?? new Date().toISOString(),
      level: input.level,
      source: input.source,
      message: input.message,
      connectionId: input.connectionId,
      connectionName: input.connectionName,
      tabId: input.tabId,
      tabTitle: input.tabTitle,
    };

    this.entries = [...this.entries, entry].slice(-MAX_LOG_ENTRIES);
    return entry;
  }

  clear(): void {
    this.entries = [];
  }

  getEntries(): LogEntry[] {
    return this.entries;
  }
}

export const logStore = new LogStore();
