import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { selectors, type Selectors } from './helpers/selectors';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_BASE = 'http://127.0.0.1:3001/api';

interface MongoInfo {
  host: string;
  port: number;
  tempDir: string;
}

interface AppFixtures {
  s: Selectors;
  mongoInfo: MongoInfo;
}

function readMongoInfo(): MongoInfo {
  const raw = readFileSync(join(__dirname, '.mongo-info.json'), 'utf-8');
  return JSON.parse(raw) as MongoInfo;
}

/** Delete all connections via the API. Call in beforeEach for test isolation. */
export async function deleteAllConnections(request: APIRequestContext): Promise<void> {
  const response = await request.get(`${API_BASE}/connections`);
  const connections = (await response.json()) as { id: string }[];
  for (const conn of connections) {
    await request.delete(`${API_BASE}/connections/${conn.id}`);
  }
}

export const test = base.extend<AppFixtures>({
  s: async ({ page }, use) => {
    await use(selectors(page));
  },

  // eslint-disable-next-line no-empty-pattern
  mongoInfo: async ({}, use) => {
    await use(readMongoInfo());
  },
});

export { expect };

// --- Helper functions ---

/** Open the New Connection dialog, fill it, and save. Returns after dialog closes. */
export async function createConnection(
  page: Page,
  opts: { name: string; host: string; port: number },
): Promise<void> {
  const s = selectors(page);

  await s.header.newConnectionButton().click();
  await expect(s.connectionDialog.overlay()).toBeVisible();

  await s.connectionDialog.nameInput().clear();
  await s.connectionDialog.nameInput().fill(opts.name);
  await s.connectionDialog.hostInput().clear();
  await s.connectionDialog.hostInput().fill(opts.host);
  await s.connectionDialog.portInput().clear();
  await s.connectionDialog.portInput().fill(String(opts.port));

  await s.connectionDialog.saveButton().click();
  await expect(s.connectionDialog.overlay()).not.toBeVisible();
}

/** Click a connection in the sidebar to connect. Waits for the tree item to expand. */
export async function connectToServer(page: Page, connectionName: string): Promise<void> {
  const s = selectors(page);
  const item = s.sidebar.treeItem(connectionName);
  await item.click();
  await expect(item).toHaveAttribute('aria-expanded', 'true', { timeout: 10_000 });
}
