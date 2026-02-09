import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';
import { MongoClient } from 'mongodb';
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

/** Seed documents into the test MongoDB. Returns a cleanup function that drops the database. */
export async function seedDatabase(
  mongoInfo: MongoInfo,
  database: string,
  collection: string,
  documents: Record<string, unknown>[]
): Promise<void> {
  const uri = `mongodb://${mongoInfo.host}:${mongoInfo.port}`;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(database);
    await db.collection(collection).insertMany(documents);
  } finally {
    await client.close();
  }
}

/** Drop a database from the test MongoDB. */
export async function cleanupDatabase(mongoInfo: MongoInfo, database: string): Promise<void> {
  const uri = `mongodb://${mongoInfo.host}:${mongoInfo.port}`;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    await client.db(database).dropDatabase();
  } finally {
    await client.close();
  }
}

/** Delete all connections via the API. Call in beforeEach for test isolation. */
export async function deleteAllConnections(request: APIRequestContext): Promise<void> {
  const response = await request.get(`${API_BASE}/connections`);
  if (!response.ok()) return;
  const body = await response.json();
  const connections = Array.isArray(body) ? (body as { id: string }[]) : [];
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

/** Expand a tree node by clicking its chevron. */
export async function expandTreeNode(page: Page, name: string): Promise<void> {
  const s = selectors(page);
  const item = s.sidebar.treeItem(name);
  // Click the node to select it, then press ArrowRight to expand
  await item.click();
  await page.keyboard.press('ArrowRight');
}

// --- Helper functions ---

/** Open the New Connection dialog, fill it, and save. Returns after dialog closes. */
export async function createConnection(
  page: Page,
  opts: { name: string; host: string; port: number }
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

/** Open the New Connection dialog, switch to URI tab, fill URI, and save. Returns after dialog closes. */
export async function createConnectionViaUri(
  page: Page,
  opts: { name: string; uri: string }
): Promise<void> {
  const s = selectors(page);

  await s.header.newConnectionButton().click();
  await expect(s.connectionDialog.overlay()).toBeVisible();

  await s.connectionDialog.nameInput().clear();
  await s.connectionDialog.nameInput().fill(opts.name);

  // Switch to URI tab
  await s.connectionDialog.uriTab().click();
  await s.connectionDialog.uriInput().fill(opts.uri);

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
