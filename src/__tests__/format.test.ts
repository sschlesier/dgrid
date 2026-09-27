import { describe, it, expect } from 'vitest';
import { formatBytes, formatCount, formatTtl } from '../lib/format';

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });
});

describe('formatCount', () => {
  it('formats small numbers', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(42)).toBe('42');
  });

  it('formats large numbers with separators', () => {
    expect(formatCount(1000)).toBe('1,000');
    expect(formatCount(1000000)).toBe('1,000,000');
  });
});

describe('formatTtl', () => {
  it.each([
    [0, '0s'],
    [45, '45s'],
    [60, '1m (60s)'],
    [90, '1.5m (90s)'],
    [92, '1.5m (92s)'],
    [300, '5m (300s)'],
    [3599, '1h (3599s)'],
    [5400, '1.5h (5400s)'],
    [10800, '3h (10800s)'],
    [86400, '1d (86400s)'],
    [129600, '1.5d (129600s)'],
    [1900800, '22d (1900800s)'],
    [31536000, '365d (31536000s)'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatTtl(seconds)).toBe(expected);
  });

  it('returns non-integer and negative input unchanged', () => {
    expect(formatTtl(1.5)).toBe('1.5s');
    expect(formatTtl(-5)).toBe('-5s');
  });
});
