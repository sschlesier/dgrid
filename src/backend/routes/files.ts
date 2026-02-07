import { FastifyInstance } from 'fastify';
import { readFile, writeFile, mkdir, access, constants } from 'fs/promises';
import { basename, dirname, extname, resolve, isAbsolute } from 'path';
import { watch, FSWatcher } from 'chokidar';

export interface FileRoutesOptions {
  allowedExtensions?: string[];
  maxFileSize?: number;
}

const DEFAULT_ALLOWED_EXTENSIONS = ['.js', '.mongodb', '.json'];
const DEFAULT_MAX_FILE_SIZE = 1024 * 1024; // 1MB

// Track active file watchers
const fileWatchers = new Map<string, FSWatcher>();

function isPathSafe(filePath: string): boolean {
  // Must be absolute path
  if (!isAbsolute(filePath)) {
    return false;
  }

  // Prevent directory traversal
  const resolved = resolve(filePath);
  if (resolved !== filePath) {
    return false;
  }

  // Allow temp directories (for testing and temporary files)
  if (filePath.startsWith('/var/folders/') || filePath.startsWith('/tmp/')) {
    return true;
  }

  // Block sensitive paths
  const blockedPatterns = [
    '/etc/',
    '/var/log/',
    '/var/run/',
    '/var/lib/',
    '/usr/',
    '/bin/',
    '/sbin/',
    '/System/',
    '/Library/',
    'node_modules',
    '.git',
    '.env',
  ];

  for (const pattern of blockedPatterns) {
    if (filePath.includes(pattern)) {
      return false;
    }
  }

  return true;
}

export async function fileRoutes(
  fastify: FastifyInstance,
  opts: FileRoutesOptions = {}
): Promise<void> {
  const allowedExtensions = opts.allowedExtensions ?? DEFAULT_ALLOWED_EXTENSIONS;
  const maxFileSize = opts.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;

  // Read file contents
  fastify.get<{ Querystring: { path: string } }>('/read', async (request, reply) => {
    const { path: filePath } = request.query;

    if (!filePath) {
      return reply.status(400).send({
        error: 'BadRequest',
        message: 'File path is required',
        statusCode: 400,
      });
    }

    if (!isPathSafe(filePath)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Access to this path is not allowed',
        statusCode: 403,
      });
    }

    const ext = extname(filePath).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return reply.status(400).send({
        error: 'BadRequest',
        message: `File type not allowed. Allowed: ${allowedExtensions.join(', ')}`,
        statusCode: 400,
      });
    }

    try {
      await access(filePath, constants.R_OK);
      const content = await readFile(filePath, 'utf-8');

      if (content.length > maxFileSize) {
        return reply.status(413).send({
          error: 'PayloadTooLarge',
          message: `File exceeds maximum size of ${maxFileSize} bytes`,
          statusCode: 413,
        });
      }

      return reply.send({
        path: filePath,
        name: basename(filePath),
        content,
      });
    } catch (e) {
      const error = e as Error & { code?: string };
      if (error.code === 'ENOENT') {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'File not found',
          statusCode: 404,
        });
      }
      if (error.code === 'EACCES') {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Permission denied',
          statusCode: 403,
        });
      }
      throw error;
    }
  });

  // Write file contents
  fastify.post<{ Body: { path: string; content: string } }>('/write', async (request, reply) => {
    const { path: filePath, content } = request.body;

    if (!filePath || content === undefined) {
      return reply.status(400).send({
        error: 'BadRequest',
        message: 'File path and content are required',
        statusCode: 400,
      });
    }

    if (!isPathSafe(filePath)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Access to this path is not allowed',
        statusCode: 403,
      });
    }

    const ext = extname(filePath).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return reply.status(400).send({
        error: 'BadRequest',
        message: `File type not allowed. Allowed: ${allowedExtensions.join(', ')}`,
        statusCode: 400,
      });
    }

    if (content.length > maxFileSize) {
      return reply.status(413).send({
        error: 'PayloadTooLarge',
        message: `Content exceeds maximum size of ${maxFileSize} bytes`,
        statusCode: 413,
      });
    }

    try {
      // Ensure parent directory exists
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf-8');
      return reply.send({
        success: true,
        path: filePath,
      });
    } catch (e) {
      const error = e as Error & { code?: string };
      if (error.code === 'EACCES') {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Permission denied',
          statusCode: 403,
        });
      }
      if (error.code === 'ENOENT') {
        return reply.status(400).send({
          error: 'BadRequest',
          message: `Parent directory does not exist: ${dirname(filePath)}`,
          statusCode: 400,
        });
      }
      throw error;
    }
  });

  // Start watching a file
  fastify.post<{ Body: { path: string } }>('/watch', async (request, reply) => {
    const { path: filePath } = request.body;

    if (!filePath) {
      return reply.status(400).send({
        error: 'BadRequest',
        message: 'File path is required',
        statusCode: 400,
      });
    }

    if (!isPathSafe(filePath)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Access to this path is not allowed',
        statusCode: 403,
      });
    }

    // Check if already watching
    if (fileWatchers.has(filePath)) {
      return reply.send({
        watching: true,
        path: filePath,
        message: 'Already watching this file',
      });
    }

    try {
      await access(filePath, constants.R_OK);

      const watcher = watch(filePath, {
        persistent: true,
        ignoreInitial: true,
      });

      fileWatchers.set(filePath, watcher);

      return reply.send({
        watching: true,
        path: filePath,
      });
    } catch (e) {
      const error = e as Error & { code?: string };
      if (error.code === 'ENOENT') {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'File not found',
          statusCode: 404,
        });
      }
      throw error;
    }
  });

  // Stop watching a file
  fastify.post<{ Body: { path: string } }>('/unwatch', async (request, reply) => {
    const { path: filePath } = request.body;

    if (!filePath) {
      return reply.status(400).send({
        error: 'BadRequest',
        message: 'File path is required',
        statusCode: 400,
      });
    }

    const watcher = fileWatchers.get(filePath);
    if (watcher) {
      await watcher.close();
      fileWatchers.delete(filePath);
    }

    return reply.send({
      watching: false,
      path: filePath,
    });
  });

  // Cleanup watchers on close
  fastify.addHook('onClose', async () => {
    for (const [, watcher] of fileWatchers) {
      await watcher.close();
    }
    fileWatchers.clear();
  });
}
