import { describe, it, expect } from 'vitest';
import { isPathSafe, isAllowedExtension, ALLOWED_EXTENSIONS } from '../../validation/file-validation.js';

describe('file-validation', () => {
  describe('ALLOWED_EXTENSIONS', () => {
    it('includes .js, .mongodb, and .json', () => {
      expect(ALLOWED_EXTENSIONS).toEqual(['.js', '.mongodb', '.json']);
    });
  });

  describe('isPathSafe', () => {
    it('rejects relative paths', () => {
      expect(isPathSafe('relative/path.js')).toBe(false);
    });

    it('rejects paths with directory traversal', () => {
      expect(isPathSafe('/home/user/../etc/passwd')).toBe(false);
    });

    it('allows temp directories under /var/folders/', () => {
      expect(isPathSafe('/var/folders/xx/abc123/T/file.js')).toBe(true);
    });

    it('allows /tmp/ paths', () => {
      expect(isPathSafe('/tmp/test-file.js')).toBe(true);
    });

    it('blocks /etc/ paths', () => {
      expect(isPathSafe('/etc/passwd')).toBe(false);
    });

    it('blocks /var/log/ paths', () => {
      expect(isPathSafe('/var/log/syslog')).toBe(false);
    });

    it('blocks /var/run/ paths', () => {
      expect(isPathSafe('/var/run/mongod.pid')).toBe(false);
    });

    it('blocks /var/lib/ paths', () => {
      expect(isPathSafe('/var/lib/mongodb/data')).toBe(false);
    });

    it('blocks /usr/ paths', () => {
      expect(isPathSafe('/usr/bin/node')).toBe(false);
    });

    it('blocks /bin/ paths', () => {
      expect(isPathSafe('/bin/sh')).toBe(false);
    });

    it('blocks /sbin/ paths', () => {
      expect(isPathSafe('/sbin/reboot')).toBe(false);
    });

    it('blocks /System/ paths', () => {
      expect(isPathSafe('/System/Library/file')).toBe(false);
    });

    it('blocks /Library/ paths', () => {
      expect(isPathSafe('/Library/Preferences/file')).toBe(false);
    });

    it('blocks node_modules paths', () => {
      expect(isPathSafe('/home/user/project/node_modules/pkg/index.js')).toBe(false);
    });

    it('blocks .git paths', () => {
      expect(isPathSafe('/home/user/project/.git/config')).toBe(false);
    });

    it('blocks .env paths', () => {
      expect(isPathSafe('/home/user/project/.env')).toBe(false);
    });

    it('allows safe absolute paths', () => {
      expect(isPathSafe('/home/user/queries/test.js')).toBe(true);
    });

    it('allows paths in user home directories', () => {
      expect(isPathSafe('/Users/testuser/Documents/query.mongodb')).toBe(true);
    });
  });

  describe('isAllowedExtension', () => {
    it('allows .js files', () => {
      expect(isAllowedExtension('/path/to/file.js')).toBe(true);
    });

    it('allows .mongodb files', () => {
      expect(isAllowedExtension('/path/to/file.mongodb')).toBe(true);
    });

    it('allows .json files', () => {
      expect(isAllowedExtension('/path/to/file.json')).toBe(true);
    });

    it('rejects disallowed extensions', () => {
      expect(isAllowedExtension('/path/to/file.exe')).toBe(false);
      expect(isAllowedExtension('/path/to/file.sh')).toBe(false);
      expect(isAllowedExtension('/path/to/file.py')).toBe(false);
    });

    it('handles case insensitivity', () => {
      expect(isAllowedExtension('/path/to/file.JS')).toBe(true);
      expect(isAllowedExtension('/path/to/file.Json')).toBe(true);
    });

    it('accepts custom allowed extensions', () => {
      expect(isAllowedExtension('/path/to/file.ts', ['.ts', '.tsx'])).toBe(true);
      expect(isAllowedExtension('/path/to/file.js', ['.ts', '.tsx'])).toBe(false);
    });
  });
});
