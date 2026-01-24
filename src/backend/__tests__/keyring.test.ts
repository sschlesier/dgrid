import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @napi-rs/keyring
const mockGetPassword = vi.fn();
const mockSetPassword = vi.fn();
const mockDeletePassword = vi.fn();

vi.mock('@napi-rs/keyring', () => ({
  Entry: vi.fn().mockImplementation(() => ({
    getPassword: mockGetPassword,
    setPassword: mockSetPassword,
    deletePassword: mockDeletePassword,
  })),
}));

import { createPasswordStorage } from '../storage/keyring.js';

describe('Password Storage', () => {
  let storage: ReturnType<typeof createPasswordStorage>;

  beforeEach(() => {
    storage = createPasswordStorage('test-service');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('returns password when found', async () => {
      mockGetPassword.mockReturnValue('secret123');

      const password = await storage.get('connection-1');

      expect(password).toBe('secret123');
    });

    it('returns undefined when not found', async () => {
      mockGetPassword.mockImplementation(() => {
        throw new Error('Entry not found');
      });

      const password = await storage.get('connection-1');

      expect(password).toBeUndefined();
    });

    it('returns undefined when keyring unavailable', async () => {
      mockGetPassword.mockImplementation(() => {
        throw new Error('Keyring unavailable');
      });

      const password = await storage.get('connection-1');

      expect(password).toBeUndefined();
    });
  });

  describe('set', () => {
    it('stores password successfully', async () => {
      await storage.set('connection-1', 'newpassword');

      expect(mockSetPassword).toHaveBeenCalledWith('newpassword');
    });

    it('throws error when storage fails', async () => {
      mockSetPassword.mockImplementation(() => {
        throw new Error('Access denied');
      });

      await expect(storage.set('connection-1', 'password')).rejects.toThrow(
        'Failed to store password: Access denied'
      );
    });
  });

  describe('delete', () => {
    it('deletes password successfully', async () => {
      await storage.delete('connection-1');

      expect(mockDeletePassword).toHaveBeenCalled();
    });

    it('does not throw when entry does not exist', async () => {
      mockDeletePassword.mockImplementation(() => {
        throw new Error('Entry not found');
      });

      await expect(storage.delete('connection-1')).resolves.toBeUndefined();
    });
  });
});
