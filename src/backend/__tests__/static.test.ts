import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { staticPlugin } from '../static.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

const mockFrontendDir = join(process.cwd(), 'dist', 'frontend');

describe('Static Plugin', () => {
  let app: FastifyInstance;

  beforeAll(() => {
    // Create mock frontend directory with test files
    mkdirSync(mockFrontendDir, { recursive: true });
    mkdirSync(join(mockFrontendDir, 'assets'), { recursive: true });

    writeFileSync(
      join(mockFrontendDir, 'index.html'),
      '<!DOCTYPE html><html><body>Test App</body></html>'
    );
    writeFileSync(join(mockFrontendDir, 'assets', 'style.css'), 'body { color: black; }');
    writeFileSync(join(mockFrontendDir, 'assets', 'app.js'), 'console.log("test");');
    writeFileSync(join(mockFrontendDir, 'data.json'), '{"test": true}');
  });

  afterAll(() => {
    // Cleanup mock frontend directory
    rmSync(mockFrontendDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    app = Fastify();
    await app.register(staticPlugin);
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('MIME types', () => {
    it('serves HTML with correct MIME type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/index.html',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(response.body).toContain('Test App');
    });

    it('serves CSS with correct MIME type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/assets/style.css',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/css; charset=utf-8');
      expect(response.body).toContain('color: black');
    });

    it('serves JavaScript with correct MIME type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/assets/app.js',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/javascript; charset=utf-8');
      expect(response.body).toContain('console.log');
    });

    it('serves JSON with correct MIME type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/data.json',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(response.body).toContain('"test": true');
    });
  });

  describe('SPA fallback', () => {
    it('serves index.html for root path', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(response.body).toContain('Test App');
    });

    it('serves index.html for unknown paths (SPA routing)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/some/unknown/route',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(response.body).toContain('Test App');
    });

    it('handles paths with query strings', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/index.html?v=123',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    });
  });

  describe('security', () => {
    it('does not serve files outside static directory', async () => {
      // Even if URL normalization occurs, we verify that paths
      // attempting to escape the static directory are handled safely

      const response = await app.inject({
        method: 'GET',
        url: '/../package.json', // Would be package.json at project root
      });

      // Should NOT return the actual package.json content
      // Instead should return index.html (SPA fallback)
      // This proves we don't leak files outside static dir
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Test App'); // SPA fallback, not package.json
      expect(response.body).not.toContain('"dgrid-v2"');
    });

    it('rejects encoded directory traversal attempts', async () => {
      // Manually encode the URL to bypass framework normalization
      const response = await app.inject({
        method: 'GET',
        url: '/..%2f..%2f..%2fetc/passwd',
      });

      // The resolved path check should catch this
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Invalid path' });
    });

    it('rejects double slash attempts', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '//etc/passwd',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Invalid path' });
    });
  });

  describe('API route passthrough', () => {
    it('does not handle /api routes', async () => {
      // Register a mock API route to verify passthrough
      const apiApp = Fastify();
      apiApp.get('/api/test', async () => ({ api: true }));
      await apiApp.register(staticPlugin);
      await apiApp.ready();

      const response = await apiApp.inject({
        method: 'GET',
        url: '/api/test',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ api: true });

      await apiApp.close();
    });
  });
});
