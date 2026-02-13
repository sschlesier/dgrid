import { describe, it, expect, vi } from 'vitest';
import { requireConnection, requireDatabase, requireClient, handleConnectionError } from '../../routes/guards.js';
import type { ConnectionPool } from '../../db/mongodb.js';
import type { FastifyReply } from 'fastify';
import { Db, MongoClient } from 'mongodb';

function createMockReply(): FastifyReply {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply;
  return reply;
}

function createMockPool(overrides: Partial<ConnectionPool> = {}): ConnectionPool {
  return {
    isConnected: vi.fn().mockReturnValue(false),
    getDb: vi.fn().mockReturnValue(undefined),
    getClient: vi.fn().mockReturnValue(undefined),
    forceDisconnect: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn(),
    disconnect: vi.fn(),
    listConnections: vi.fn(),
    disconnectAll: vi.fn(),
    ...overrides,
  };
}

describe('Route Guards', () => {
  describe('requireConnection', () => {
    it('returns false and sends 400 when not connected', () => {
      const reply = createMockReply();
      const pool = createMockPool({ isConnected: vi.fn().mockReturnValue(false) });

      const result = requireConnection(pool, 'conn-1', reply);

      expect(result).toBe(false);
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'BadRequest',
          message: 'Connection not active. Please connect first.',
        })
      );
    });

    it('returns true when connected', () => {
      const reply = createMockReply();
      const pool = createMockPool({ isConnected: vi.fn().mockReturnValue(true) });

      const result = requireConnection(pool, 'conn-1', reply);

      expect(result).toBe(true);
      expect(reply.status).not.toHaveBeenCalled();
    });
  });

  describe('requireDatabase', () => {
    it('returns null and sends 400 when db not found', () => {
      const reply = createMockReply();
      const pool = createMockPool({ getDb: vi.fn().mockReturnValue(undefined) });

      const result = requireDatabase(pool, 'conn-1', 'testdb', reply);

      expect(result).toBeNull();
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'BadRequest',
          message: 'Database not found or not specified.',
        })
      );
    });

    it('returns Db when found', () => {
      const mockDb = {} as Db;
      const reply = createMockReply();
      const pool = createMockPool({ getDb: vi.fn().mockReturnValue(mockDb) });

      const result = requireDatabase(pool, 'conn-1', 'testdb', reply);

      expect(result).toBe(mockDb);
      expect(reply.status).not.toHaveBeenCalled();
    });
  });

  describe('requireClient', () => {
    it('returns null and sends 500 when client missing', () => {
      const reply = createMockReply();
      const pool = createMockPool({ getClient: vi.fn().mockReturnValue(undefined) });

      const result = requireClient(pool, 'conn-1', reply);

      expect(result).toBeNull();
      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'InternalError',
          message: 'Failed to get database client',
        })
      );
    });

    it('returns MongoClient when available', () => {
      const mockClient = {} as MongoClient;
      const reply = createMockReply();
      const pool = createMockPool({ getClient: vi.fn().mockReturnValue(mockClient) });

      const result = requireClient(pool, 'conn-1', reply);

      expect(result).toBe(mockClient);
      expect(reply.status).not.toHaveBeenCalled();
    });
  });

  describe('handleConnectionError', () => {
    it('sends isConnected: false and calls forceDisconnect for connection errors', async () => {
      const reply = createMockReply();
      const pool = createMockPool();
      const error = new Error('Network timeout');
      error.name = 'MongoNetworkError';

      await handleConnectionError(pool, 'conn-1', reply, error, 'DatabaseError');

      expect(pool.forceDisconnect).toHaveBeenCalledWith('conn-1');
      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'DatabaseError',
          message: 'Network timeout',
          statusCode: 500,
          isConnected: false,
        })
      );
    });

    it('sends plain 500 for non-connection errors', async () => {
      const reply = createMockReply();
      const pool = createMockPool();
      const error = new Error('Something went wrong');

      await handleConnectionError(pool, 'conn-1', reply, error, 'DatabaseError');

      expect(pool.forceDisconnect).not.toHaveBeenCalled();
      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'DatabaseError',
          message: 'Something went wrong',
          statusCode: 500,
        })
      );
      expect(reply.send).toHaveBeenCalledWith(
        expect.not.objectContaining({
          isConnected: false,
        })
      );
    });
  });
});
