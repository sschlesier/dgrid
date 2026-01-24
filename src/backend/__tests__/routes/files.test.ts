import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileRoutes } from '../../routes/files.js';

describe('File Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'dgrid-files-test-'));

    app = Fastify();
    await app.register(fileRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('GET /read', () => {
    it('reads file content', async () => {
      const filePath = join(tempDir, 'test.js');
      await writeFile(filePath, 'db.users.find({})');

      const response = await app.inject({
        method: 'GET',
        url: `/read?path=${encodeURIComponent(filePath)}`,
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.content).toBe('db.users.find({})');
      expect(result.name).toBe('test.js');
    });

    it('returns 404 for non-existent file', async () => {
      const filePath = join(tempDir, 'nonexistent.js');

      const response = await app.inject({
        method: 'GET',
        url: `/read?path=${encodeURIComponent(filePath)}`,
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 400 for disallowed extension', async () => {
      const filePath = join(tempDir, 'test.exe');
      await writeFile(filePath, 'content');

      const response = await app.inject({
        method: 'GET',
        url: `/read?path=${encodeURIComponent(filePath)}`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('File type not allowed');
    });

    it('returns 403 for blocked paths', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/read?path=${encodeURIComponent('/etc/passwd')}`,
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 400 when path is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/read',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /write', () => {
    it('writes file content', async () => {
      const filePath = join(tempDir, 'output.js');

      const response = await app.inject({
        method: 'POST',
        url: '/write',
        payload: {
          path: filePath,
          content: 'db.orders.find({})',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);

      // Verify content was written
      const readResponse = await app.inject({
        method: 'GET',
        url: `/read?path=${encodeURIComponent(filePath)}`,
      });
      expect(readResponse.json().content).toBe('db.orders.find({})');
    });

    it('returns 400 for disallowed extension', async () => {
      const filePath = join(tempDir, 'test.sh');

      const response = await app.inject({
        method: 'POST',
        url: '/write',
        payload: {
          path: filePath,
          content: 'echo hello',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 403 for blocked paths', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/write',
        payload: {
          path: '/etc/test.js',
          content: 'content',
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /watch and /unwatch', () => {
    it('starts watching a file', async () => {
      const filePath = join(tempDir, 'watch.js');
      await writeFile(filePath, 'content');

      const response = await app.inject({
        method: 'POST',
        url: '/watch',
        payload: { path: filePath },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().watching).toBe(true);
    });

    it('handles duplicate watch requests', async () => {
      const filePath = join(tempDir, 'watch.js');
      await writeFile(filePath, 'content');

      await app.inject({
        method: 'POST',
        url: '/watch',
        payload: { path: filePath },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/watch',
        payload: { path: filePath },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().message).toContain('Already watching');
    });

    it('stops watching a file', async () => {
      const filePath = join(tempDir, 'watch.js');
      await writeFile(filePath, 'content');

      await app.inject({
        method: 'POST',
        url: '/watch',
        payload: { path: filePath },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/unwatch',
        payload: { path: filePath },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().watching).toBe(false);
    });

    it('returns 404 for non-existent file', async () => {
      const filePath = join(tempDir, 'nonexistent.js');

      const response = await app.inject({
        method: 'POST',
        url: '/watch',
        payload: { path: filePath },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
