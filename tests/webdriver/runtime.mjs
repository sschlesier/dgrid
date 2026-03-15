import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const runtimeFile = process.env.DGRID_E2E_RUNTIME_FILE;

export async function readRuntimeInfo() {
  if (!runtimeFile) {
    throw new Error('DGRID_E2E_RUNTIME_FILE is not set');
  }
  const raw = await readFile(runtimeFile, 'utf8');
  return JSON.parse(raw);
}

export async function seedDatabase(database, collection, documents) {
  const runtime = await readRuntimeInfo();
  const client = new MongoClient(`mongodb://${runtime.mongo.host}:${runtime.mongo.port}`);
  try {
    await client.connect();
    await client.db(database).collection(collection).insertMany(documents);
  } finally {
    await client.close();
  }
}

export async function cleanupDatabase(database) {
  const runtime = await readRuntimeInfo();
  const client = new MongoClient(`mongodb://${runtime.mongo.host}:${runtime.mongo.port}`);
  try {
    await client.connect();
    await client.db(database).dropDatabase();
  } catch (error) {
    if (!String(error).includes('ns not found')) {
      throw error;
    }
  } finally {
    await client.close();
  }
}

export async function deleteAllConnections() {
  const runtime = await readRuntimeInfo();
  const connectionsPath = path.join(runtime.dataDir, 'connections.json');
  if (existsSync(connectionsPath)) {
    await writeFile(connectionsPath, JSON.stringify({ version: 1, connections: [] }, null, 2));
  }
}
