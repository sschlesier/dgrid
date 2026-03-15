import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeFile = process.env.DGRID_E2E_RUNTIME_FILE;
if (!runtimeFile || !fs.existsSync(runtimeFile)) {
  throw new Error('DGRID_E2E_RUNTIME_FILE must point to an existing runtime file');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtime = JSON.parse(fs.readFileSync(runtimeFile, 'utf8'));

export const config = {
  runner: 'local',
  specs: [path.join(__dirname, 'specs', '**/*.e2e.mjs')],
  maxInstances: 1,
  hostname: '127.0.0.1',
  port: runtime.webdriverPort,
  path: '/',
  logLevel: 'warn',
  framework: 'mocha',
  reporters: ['spec'],
  waitforTimeout: 10_000,
  connectionRetryCount: 1,
  connectionRetryTimeout: 30_000,
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },
  capabilities: [
    {
      browserName: 'wry',
      'tauri:options': {
        application: path.resolve(runtime.applicationPath),
      },
    },
  ],
};
