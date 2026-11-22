import { describe, it, expect } from 'vitest';
import { formatServerInfoValue, formatUptime, sectionRows } from '../lib/serverInfo';

describe('formatUptime', () => {
  it('formats seconds as days, hours and minutes', () => {
    expect(formatUptime(2 * 86400 + 3 * 3600 + 4 * 60 + 59)).toBe('2d 3h 4m');
  });
});

describe('formatServerInfoValue', () => {
  it('unwraps tagged values', () => {
    expect(formatServerInfoValue('pid', { _type: 'Long', _value: '42' })).toBe('42');
  });

  it('renders booleans as Yes/No', () => {
    expect(formatServerInfoValue('debug', false)).toBe('No');
  });
});

describe('sectionRows', () => {
  it('omits the version row and labels the rest', () => {
    const rows = sectionRows({ data: { version: '7.0.5', allocator: 'tcmalloc' } });
    expect(rows).toEqual([{ key: 'allocator', label: 'Allocator', value: 'tcmalloc' }]);
  });
});
