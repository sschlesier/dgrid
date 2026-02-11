import { FastifyInstance } from 'fastify';
import type { VersionResponse } from '../../shared/contracts.js';
import { checkForUpdate, type UpdateCheckResult } from '../tray/update-checker.js';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cachedResult: { response: VersionResponse; timestamp: number } | null = null;

export async function versionRoutes(fastify: FastifyInstance): Promise<void> {
  const version = typeof DGRID_VERSION !== 'undefined' ? DGRID_VERSION : 'dev';

  fastify.get('/', async (): Promise<VersionResponse> => {
    // Skip update check in dev mode
    if (version === 'dev') {
      return { version };
    }

    // Return cached result if fresh
    if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_TTL_MS) {
      return cachedResult.response;
    }

    const result: UpdateCheckResult = await checkForUpdate(version);
    const response: VersionResponse = { version };
    if (result.available && result.version && result.url) {
      response.update = { version: result.version, url: result.url };
    }

    cachedResult = { response, timestamp: Date.now() };
    return response;
  });
}
