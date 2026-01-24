import { FastifyInstance } from 'fastify';
import { readFile, access, constants } from 'fs/promises';
import { watch, FSWatcher } from 'chokidar';
import { extname, resolve, isAbsolute } from 'path';

interface WatchMessage {
  type: 'watch';
  path: string;
}

interface UnwatchMessage {
  type: 'unwatch';
  path: string;
}

type ClientMessage = WatchMessage | UnwatchMessage;

interface FileChangedMessage {
  type: 'file-changed';
  path: string;
  content: string;
}

interface WatchAckMessage {
  type: 'watch-ack';
  path: string;
}

interface UnwatchAckMessage {
  type: 'unwatch-ack';
  path: string;
}

interface ErrorMessage {
  type: 'error';
  path?: string;
  message: string;
}

type ServerMessage = FileChangedMessage | WatchAckMessage | UnwatchAckMessage | ErrorMessage;

const ALLOWED_EXTENSIONS = ['.js', '.mongodb', '.json'];

function isPathSafe(filePath: string): boolean {
  if (!isAbsolute(filePath)) {
    return false;
  }

  const resolved = resolve(filePath);
  if (resolved !== filePath) {
    return false;
  }

  // Allow temp directories
  if (filePath.startsWith('/var/folders/') || filePath.startsWith('/tmp/')) {
    return true;
  }

  // Block sensitive paths
  const blockedPatterns = [
    '/etc/',
    '/var/',
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

function isAllowedExtension(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

export async function websocketRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/ws', { websocket: true }, (socket) => {
    const watchers = new Map<string, FSWatcher>();

    function send(message: ServerMessage): void {
      if (socket.readyState === 1) {
        // WebSocket.OPEN
        socket.send(JSON.stringify(message));
      }
    }

    socket.on('message', async (data: Buffer | ArrayBuffer | Buffer[]) => {
      let message: ClientMessage;

      try {
        message = JSON.parse(data.toString());
      } catch {
        send({ type: 'error', message: 'Invalid JSON message' });
        return;
      }

      if (message.type === 'watch') {
        const { path: filePath } = message;

        // Validate path
        if (!isPathSafe(filePath)) {
          send({ type: 'error', path: filePath, message: 'Access to this path is not allowed' });
          return;
        }

        if (!isAllowedExtension(filePath)) {
          send({
            type: 'error',
            path: filePath,
            message: `File type not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
          });
          return;
        }

        // Check if already watching
        if (watchers.has(filePath)) {
          send({ type: 'watch-ack', path: filePath });
          return;
        }

        // Check file exists and is readable
        try {
          await access(filePath, constants.R_OK);
        } catch {
          send({ type: 'error', path: filePath, message: 'File not found or not readable' });
          return;
        }

        // Create watcher
        const watcher = watch(filePath, {
          persistent: true,
          ignoreInitial: true,
        });

        watcher.on('change', async () => {
          try {
            const content = await readFile(filePath, 'utf-8');
            send({ type: 'file-changed', path: filePath, content });
          } catch (e) {
            send({ type: 'error', path: filePath, message: (e as Error).message });
          }
        });

        watcher.on('error', (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          send({ type: 'error', path: filePath, message });
        });

        watchers.set(filePath, watcher);
        send({ type: 'watch-ack', path: filePath });

        fastify.log.debug({ path: filePath }, 'Started watching file');
      } else if (message.type === 'unwatch') {
        const { path: filePath } = message;

        const watcher = watchers.get(filePath);
        if (watcher) {
          await watcher.close();
          watchers.delete(filePath);
          fastify.log.debug({ path: filePath }, 'Stopped watching file');
        }

        send({ type: 'unwatch-ack', path: filePath });
      }
    });

    socket.on('close', async () => {
      // Cleanup all watchers when connection closes
      for (const [path, watcher] of watchers) {
        await watcher.close();
        fastify.log.debug({ path }, 'Cleaned up watcher on connection close');
      }
      watchers.clear();
    });

    socket.on('error', (error: Error) => {
      fastify.log.error(error, 'WebSocket error');
    });
  });
}
