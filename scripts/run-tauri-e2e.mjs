import { spawn } from 'node:child_process';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const runtimeFile = path.join(repoRoot, 'tests', 'webdriver', '.runtime.json');
const driverPort = parseInt(process.env.DGRID_E2E_WEBDRIVER_PORT || '4444', 10);

const argv = process.argv.slice(2);
const isCi = argv.includes('--ci') || process.env.CI === 'true';
const specIndex = argv.indexOf('--spec');
const specArg = specIndex >= 0 ? argv[specIndex + 1] : undefined;
const driverStartTimeoutMs = parseInt(
  process.env.DGRID_E2E_DRIVER_START_TIMEOUT_MS || (isCi ? '30000' : '15000'),
  10
);

let mongod;
let tauriDriverProcess;
let tempDir;

try {
  await ensureDriverInstalled();
  await runCommand('pnpm', ['tauri', 'build', '--debug', '--no-bundle', '--ci'], {
    cwd: repoRoot,
  });

  const { MongoMemoryServer } = await import('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();

  tempDir = await createTempDir();
  const mongoUrl = new URL(mongod.getUri());
  const runtime = {
    mongo: {
      host: mongoUrl.hostname,
      port: parseInt(mongoUrl.port, 10),
    },
    dataDir: tempDir,
    applicationPath: await resolveApplicationPath(),
    webdriverPort: driverPort,
  };

  await mkdir(path.dirname(runtimeFile), { recursive: true });
  await writeFile(runtimeFile, JSON.stringify(runtime, null, 2));

  tauriDriverProcess = spawn(getDriverCommand(), [], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      DGRID_DATA_DIR: tempDir,
      DGRID_DISABLE_UPDATE_CHECKS: '1',
      DGRID_USE_MOCK_PASSWORDS: '1',
      DGRID_KEYRING_SERVICE: `dgrid-e2e-${process.pid}`,
      RUST_LOG: process.env.RUST_LOG || 'error',
    },
  });

  tauriDriverProcess.on('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`tauri-webdriver exited with code ${code}`);
    } else if (signal) {
      console.error(`tauri-webdriver exited with signal ${signal}`);
    }
  });

  await waitForPort(driverPort, driverStartTimeoutMs);

  const wdioArgs = ['exec', 'wdio', 'run', './tests/webdriver/wdio.conf.mjs'];
  if (specArg) {
    wdioArgs.push('--spec', specArg);
  }
  if (isCi) {
    process.env.DGRID_E2E_CI = '1';
  }

  await runCommand('pnpm', wdioArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      DGRID_E2E_RUNTIME_FILE: runtimeFile,
      DGRID_E2E_CI: isCi ? '1' : process.env.DGRID_E2E_CI || '',
    },
  });
} finally {
  if (tauriDriverProcess && !tauriDriverProcess.killed) {
    tauriDriverProcess.kill('SIGTERM');
  }

  if (mongod) {
    await mongod.stop();
  }

  await rm(runtimeFile, { force: true });
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function ensureDriverInstalled() {
  const driverCommand = getDriverCommand();
  try {
    await runCommand(driverCommand, ['--help'], { cwd: repoRoot, quiet: true });
  } catch {
    throw new Error(
      'tauri-webdriver is not installed. Run `pnpm e2e:install-driver` or set TAURI_WEBDRIVER_BIN.'
    );
  }
}

function getDriverCommand() {
  return process.env.TAURI_WEBDRIVER_BIN || 'tauri-webdriver';
}

async function resolveApplicationPath() {
  const explicitPath = process.env.DGRID_E2E_APPLICATION_PATH;
  if (explicitPath) {
    await access(explicitPath, fsConstants.X_OK);
    return explicitPath;
  }

  const suffix = process.platform === 'win32' ? '.exe' : '';
  const binaryPath = path.join(repoRoot, 'src-tauri', 'target', 'debug', `dgrid${suffix}`);
  await access(binaryPath, fsConstants.X_OK);
  return binaryPath;
}

async function createTempDir() {
  return await new Promise((resolve, reject) => {
    const prefix = path.join(os.tmpdir(), 'dgrid-e2e-');
    import('node:fs/promises')
      .then((fs) => fs.mkdtemp(prefix))
      .then(resolve, reject);
  });
}

async function waitForPort(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await new Promise((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port }, () => {
        socket.end();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
    });
    if (ready) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for tauri-webdriver on port ${port}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCommand(command, args, options) {
  const { cwd, env, quiet = false } = options;
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: quiet ? ['ignore', 'ignore', 'ignore'] : 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with code ${code ?? 'unknown'}`));
    });
  });
}
