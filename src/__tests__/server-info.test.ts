import { describe, it, expect } from 'vitest';
import {
  allSectionsFailed,
  formatServerInfoValue,
  formatUptime,
  sectionRows,
  serverVersion,
} from '../lib/serverInfo';

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

describe('formatServerInfoValue collections', () => {
  it('joins arrays with comma and space', () => {
    expect(formatServerInfoValue('hosts', ['a:1', 'b:2'])).toBe('a:1, b:2');
  });

  it('flattens objects as key: value pairs', () => {
    expect(
      formatServerInfoValue('buildEnvironment', { target_os: 'linux', target_arch: 'arm64' })
    ).toBe('target_os: linux, target_arch: arm64');
  });

  it('falls back to the raw value when uptime is not numeric', () => {
    expect(formatServerInfoValue('uptime', 'soon')).toBe('soon');
  });

  it('clamps negative uptime to zero', () => {
    expect(formatUptime(-5)).toBe('0d 0h 0m');
  });
});

describe('serverVersion', () => {
  it('returns the build version when present', () => {
    const info = { build: { data: { version: '7.0.5' } }, runtime: {}, topology: {} };
    expect(serverVersion(info)).toBe('7.0.5');
  });

  it('is undefined when the build section failed', () => {
    const info = { build: { error: 'x' }, runtime: {}, topology: {} };
    expect(serverVersion(info)).toBeUndefined();
  });
});

describe('allSectionsFailed', () => {
  it('is true only when every section has an error', () => {
    const failed = { error: 'x' };
    expect(allSectionsFailed({ build: failed, runtime: failed, topology: failed })).toBe(true);
    expect(allSectionsFailed({ build: failed, runtime: failed, topology: { data: {} } })).toBe(
      false
    );
  });
});

describe('sectionRows', () => {
  it('omits the version row and labels the rest', () => {
    const rows = sectionRows({ data: { version: '7.0.5', allocator: 'tcmalloc' } });
    expect(rows).toEqual([{ key: 'allocator', label: 'Allocator', value: 'tcmalloc' }]);
  });
});
