import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { createReadStream, existsSync, statSync } from 'fs';
import { join, extname, resolve } from 'path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
};

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

export function isSeaRuntime(): boolean {
  try {
    // Node.js SEA runtime detection
    // The 'node:sea' module is only available in SEA builds
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sea = require('node:sea');
    return sea.isSea();
  } catch {
    return false;
  }
}

export function getSeaAsset(key: string): ArrayBuffer | undefined {
  if (!isSeaRuntime()) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sea = require('node:sea');
    return sea.getAsset(key);
  } catch {
    return undefined;
  }
}

function getStaticDir(): string {
  // Frontend assets are at dist/frontend relative to project root
  return join(process.cwd(), 'dist', 'frontend');
}

interface StaticPluginOptions {
  prefix?: string;
}

export const staticPlugin: FastifyPluginAsync<StaticPluginOptions> = async (
  fastify: FastifyInstance,
  _opts: StaticPluginOptions
) => {
  const isSea = isSeaRuntime();
  const staticDir = getStaticDir();

  // Serve static files for all non-API routes
  fastify.get('/*', async (request, reply) => {
    // Use raw URL to detect traversal attempts before normalization
    const rawUrl = request.raw.url ?? request.url;
    const url = request.url;

    // Skip API routes
    if (url.startsWith('/api')) {
      return reply.callNotFound();
    }

    // Determine the file path
    let filePath = url === '/' ? '/index.html' : url;

    // Remove query string if present
    const queryIndex = filePath.indexOf('?');
    if (queryIndex !== -1) {
      filePath = filePath.substring(0, queryIndex);
    }

    // Security: prevent directory traversal
    // Check both raw URL and decoded URL for traversal attempts
    const decodedUrl = decodeURIComponent(rawUrl);
    if (
      rawUrl.includes('..') ||
      rawUrl.includes('//') ||
      decodedUrl.includes('..') ||
      decodedUrl.includes('//')
    ) {
      return reply.status(400).send({ error: 'Invalid path' });
    }

    // Security: verify resolved path stays within static directory
    const resolvedPath = resolve(staticDir, '.' + filePath);
    if (!resolvedPath.startsWith(staticDir)) {
      return reply.status(400).send({ error: 'Invalid path' });
    }

    if (isSea) {
      // Serve from SEA embedded assets
      const assetKey = `frontend${filePath}`;
      const asset = getSeaAsset(assetKey);

      if (asset) {
        const mimeType = getMimeType(filePath);
        return reply.type(mimeType).send(Buffer.from(asset));
      }

      // SPA fallback: try index.html for unknown paths
      const indexAsset = getSeaAsset('frontend/index.html');
      if (indexAsset) {
        return reply.type('text/html; charset=utf-8').send(Buffer.from(indexAsset));
      }

      return reply.status(404).send({ error: 'Not found' });
    } else {
      // Serve from filesystem
      const fullPath = join(staticDir, filePath);

      if (existsSync(fullPath) && statSync(fullPath).isFile()) {
        const mimeType = getMimeType(filePath);
        const stream = createReadStream(fullPath);
        return reply.type(mimeType).send(stream);
      }

      // SPA fallback: serve index.html for unknown paths
      const indexPath = join(staticDir, 'index.html');
      if (existsSync(indexPath)) {
        const stream = createReadStream(indexPath);
        return reply.type('text/html; charset=utf-8').send(stream);
      }

      return reply.status(404).send({ error: 'Not found' });
    }
  });
};
