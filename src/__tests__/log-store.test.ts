import { beforeEach, describe, expect, it } from 'vitest';
import { logStore } from '../stores/log.svelte';

describe('logStore', () => {
  beforeEach(() => {
    logStore.clear();
  });

  it('appends entries in insertion order', () => {
    logStore.append({
      level: 'info',
      source: 'app',
      message: 'First',
      timestamp: '2026-03-28T10:00:00.000Z',
    });
    logStore.append({
      level: 'success',
      source: 'query',
      message: 'Second',
      timestamp: '2026-03-28T10:01:00.000Z',
    });

    expect(logStore.getEntries()).toHaveLength(2);
    expect(logStore.getEntries()[0].message).toBe('First');
    expect(logStore.getEntries()[1].message).toBe('Second');
  });

  it('caps entries at 100 items', () => {
    for (let i = 0; i < 105; i++) {
      logStore.append({
        level: 'info',
        source: 'app',
        message: `Entry ${i}`,
        timestamp: `2026-03-28T10:${String(i % 60).padStart(2, '0')}:00.000Z`,
      });
    }

    expect(logStore.getEntries()).toHaveLength(100);
    expect(logStore.getEntries()[0].message).toBe('Entry 5');
    expect(logStore.getEntries()[99].message).toBe('Entry 104');
  });

  it('clears all entries', () => {
    logStore.append({
      level: 'warning',
      source: 'app',
      message: 'To be cleared',
    });

    logStore.clear();

    expect(logStore.getEntries()).toEqual([]);
  });
});
