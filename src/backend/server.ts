import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { join } from 'path';
import { homedir } from 'os';
import { apiRoutes } from './routes/index.js';
import { websocketRoutes } from './routes/websocket.js';
import { createConnectionStorage } from './storage/connections.js';
import { createPasswordStorage } from './storage/keyring.js';
import { createConnectionPool } from './db/mongodb.js';
import { staticPlugin, isSeaRuntime } from './static.js';

const HOST = '127.0.0.1';
const PORT = 3001;
const DATA_DIR = process.env.DGRID_DATA_DIR ?? join(homedir(), '.dgrid');

async function main(): Promise<void> {
  // Use production logging for SEA runtime or when NODE_ENV=production
  const useProductionLogging = process.env.NODE_ENV === 'production' || isSeaRuntime();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: useProductionLogging
        ? undefined
        : { target: 'pino-pretty', options: { colorize: true } },
    },
  });

  // Security middleware
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disable for development with frontend
  });

  await app.register(cors, {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
    exposedHeaders: ['X-Total-Count'],
  });

  if (!process.env.DGRID_DATA_DIR) {
    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
    });
  }

  // WebSocket support for file watching
  await app.register(websocket);
  await app.register(websocketRoutes);

  // Initialize storage and connection pool
  const storage = createConnectionStorage(DATA_DIR);
  const passwords = createPasswordStorage();
  const pool = createConnectionPool();

  // Register API routes
  await app.register(apiRoutes, {
    prefix: '/api',
    storage,
    passwords,
    pool,
  });

  // Health check endpoint
  app.get('/health', async () => ({ status: 'ok' }));

  // Serve static frontend in production mode or SEA runtime
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction || isSeaRuntime()) {
    await app.register(staticPlugin);
  }

  // Error handler
  app.setErrorHandler((error, _request, reply) => {
    const err = error as Error & { statusCode?: number };
    app.log.error(err);

    const statusCode = err.statusCode ?? 500;
    reply.status(statusCode).send({
      error: err.name ?? 'InternalError',
      message: err.message,
      statusCode,
    });
  });

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down...');
    await pool.disconnectAll();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start server
  try {
    await app.listen({ host: HOST, port: PORT });
    app.log.info(`Server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
