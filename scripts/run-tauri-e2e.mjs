import { spawn } from 'node:child_process';
import fs, { constants as fsConstants } from 'node:fs';
import { access, appendFile, chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const runtimeFile = path.join(repoRoot, 'tests', 'webdriver', '.runtime.json');
const artifactsDir = path.join(repoRoot, 'tests', 'webdriver', 'artifacts');
const runtimeMetadataFile = path.join(artifactsDir, 'runtime-metadata.json');
const junitReportFile = path.join(artifactsDir, 'wdio-junit.xml');
const ciSummaryFile = path.join(artifactsDir, 'ci-summary.md');
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
let appLauncherPath;
let driverLogStream;
let harnessLogStream;
let harnessLogger;
let testFailure;

try {
  await prepareArtifactsDir();
  harnessLogger = createLogger('harness');
  redirectConsoleToLog(harnessLogger);
  await ensureDriverInstalled();
  await runCommand('pnpm', ['tauri', 'build', '--debug', '--no-bundle', '--ci'], {
    cwd: repoRoot,
    logger: harnessLogger,
  });

  const { MongoMemoryServer } = await import('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();

  tempDir = await createTempDir();
  const applicationBinaryPath = await resolveApplicationPath();
  appLauncherPath = await createAppLauncher(applicationBinaryPath);
  const mongoUrl = new URL(mongod.getUri());
  const runtime = {
    startedAt: new Date().toISOString(),
    ci: isCi,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    mongo: {
      host: mongoUrl.hostname,
      port: parseInt(mongoUrl.port, 10),
    },
    dataDir: tempDir,
    applicationPath: appLauncherPath,
    applicationBinaryPath,
    webdriverPort: driverPort,
    artifactsDir,
  };

  await mkdir(path.dirname(runtimeFile), { recursive: true });
  await writeFile(runtimeFile, JSON.stringify(runtime, null, 2));
  await writeFile(runtimeMetadataFile, JSON.stringify(runtime, null, 2));
  harnessLogger.info(`E2E artifacts directory: ${artifactsDir}`);
  harnessLogger.info(`Runtime file: ${runtimeFile}`);
  harnessLogger.info(`Runtime metadata: ${runtimeMetadataFile}`);
  harnessLogger.info(`Application binary: ${runtime.applicationBinaryPath}`);

  driverLogStream = fs.createWriteStream(path.join(artifactsDir, 'tauri-webdriver.log'), {
    flags: 'a',
  });

  tauriDriverProcess = spawn(getDriverCommand(), [], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DGRID_DATA_DIR: tempDir,
      DGRID_DISABLE_UPDATE_CHECKS: '1',
      DGRID_USE_MOCK_PASSWORDS: '1',
      DGRID_KEYRING_SERVICE: `dgrid-e2e-${process.pid}`,
      RUST_LOG: process.env.RUST_LOG || 'error',
    },
  });

  pipeChildOutput(tauriDriverProcess, driverLogStream, 'tauri-webdriver');

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
      DGRID_E2E_JUNIT_FILE: junitReportFile,
      DGRID_E2E_CI: isCi ? '1' : process.env.DGRID_E2E_CI || '',
    },
    logger: harnessLogger,
  });
} catch (error) {
  testFailure = error;
} finally {
  await publishCiSummary();

  if (tauriDriverProcess && !tauriDriverProcess.killed) {
    tauriDriverProcess.kill('SIGTERM');
  }

  if (mongod) {
    await mongod.stop();
  }

  await rm(runtimeFile, { force: true });
  if (appLauncherPath) {
    await rm(appLauncherPath, { force: true });
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }

  await closeStream(driverLogStream);
  await closeStream(harnessLogStream);
}

if (testFailure) {
  throw testFailure;
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
    import('node:fs/promises').then((fs) => fs.mkdtemp(prefix)).then(resolve, reject);
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
  const { cwd, env, quiet = false, logger } = options;
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: quiet ? ['ignore', 'ignore', 'ignore'] : ['ignore', 'pipe', 'pipe'],
    });

    if (!quiet) {
      pipeChildOutput(child, logger?.stream, command);
    }
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

async function prepareArtifactsDir() {
  await rm(artifactsDir, { recursive: true, force: true });
  await mkdir(artifactsDir, { recursive: true });
}

async function publishCiSummary() {
  const summary = await buildCiSummary();
  await writeFile(ciSummaryFile, summary, 'utf8');

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    await appendFile(summaryPath, summary, 'utf8');
  }
}

async function buildCiSummary() {
  const fallbackLines = [
    '## Linux E2E Summary',
    '',
    'No JUnit report was generated.',
  ];

  let xml;
  try {
    xml = await fs.promises.readFile(junitReportFile, 'utf8');
  } catch {
    return `${fallbackLines.join('\n')}\n`;
  }

  const suites = parseJUnitSuites(xml);
  if (suites.length === 0) {
    return `${fallbackLines.join('\n')}\n`;
  }

  const totalTests = suites.reduce((sum, suite) => sum + suite.tests, 0);
  const totalFailures = suites.reduce((sum, suite) => sum + suite.failures, 0);
  const totalSkipped = suites.reduce((sum, suite) => sum + suite.skipped, 0);
  const totalDuration = suites.reduce((sum, suite) => sum + suite.durationSeconds, 0);

  const lines = [
    '## Linux E2E Summary',
    '',
    `- Specs: ${suites.length}`,
    `- Tests: ${totalTests}`,
    `- Failures: ${totalFailures}`,
    `- Skipped: ${totalSkipped}`,
    `- Duration: ${formatDuration(totalDuration)}`,
    '',
    '### Spec durations',
  ];

  for (const suite of [...suites].sort((a, b) => b.durationSeconds - a.durationSeconds)) {
    lines.push(
      `- ${suite.file || suite.name}: ${formatDuration(suite.durationSeconds)} (${suite.tests} tests, ${suite.failures} failed${suite.skipped ? `, ${suite.skipped} skipped` : ''})`
    );
  }

  const failingSuites = suites.filter((suite) => suite.failures > 0);
  if (failingSuites.length > 0) {
    lines.push('', '### Failing specs');
    for (const suite of failingSuites) {
      lines.push(`- ${suite.file || suite.name}`);
      for (const failure of suite.failuresList) {
        lines.push(`  - ${failure}`);
      }
    }
  }

  lines.push('', `JUnit report: \`tests/webdriver/artifacts/${path.basename(junitReportFile)}\``);
  return `${lines.join('\n')}\n`;
}

function parseJUnitSuites(xml) {
  const suites = [];
  const suiteRegex = /<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g;

  for (const match of xml.matchAll(suiteRegex)) {
    const attrs = parseXmlAttributes(match[1] ?? '');
    const body = match[2] ?? '';
    const failuresList = [];

    for (const failureMatch of body.matchAll(/<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g)) {
      const testcaseAttrs = parseXmlAttributes(failureMatch[1] ?? '');
      const testcaseBody = failureMatch[2] ?? '';
      if (!/<failure\b/i.test(testcaseBody)) {
        continue;
      }

      const className = testcaseAttrs.classname || testcaseAttrs.class || '';
      const testName = testcaseAttrs.name || 'Unnamed test';
      failuresList.push(className ? `${className} :: ${testName}` : testName);
    }

    suites.push({
      name: attrs.name || 'Unnamed suite',
      file: attrs.file || '',
      tests: parseInt(attrs.tests || '0', 10),
      failures: parseInt(attrs.failures || '0', 10),
      skipped: parseInt(attrs.skipped || attrs.disabled || '0', 10),
      durationSeconds: parseFloat(attrs.time || '0'),
      failuresList,
    });
  }

  return suites;
}

function parseXmlAttributes(rawAttributes) {
  const attributes = {};
  const attributeRegex = /([\w:-]+)="([^"]*)"/g;

  for (const [, key, value] of rawAttributes.matchAll(attributeRegex)) {
    attributes[key] = decodeXmlEntities(value);
  }

  return attributes;
}

function decodeXmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0.0s';
  }
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - minutes * 60;
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
}

function createLogger(name) {
  const stream = fs.createWriteStream(path.join(artifactsDir, `${name}.log`), {
    flags: 'a',
  });
  return {
    stream,
    info(message) {
      writeConsoleLine('stdout', stream, `${message}\n`);
    },
    error(message) {
      writeConsoleLine('stderr', stream, `${message}\n`);
    },
  };
}

function redirectConsoleToLog(logger) {
  harnessLogStream = logger.stream;
  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = (...args) => {
    originalConsole.log(...args);
    logger.stream.write(`${formatConsoleArgs(args)}\n`);
  };
  console.info = (...args) => {
    originalConsole.info(...args);
    logger.stream.write(`${formatConsoleArgs(args)}\n`);
  };
  console.warn = (...args) => {
    originalConsole.warn(...args);
    logger.stream.write(`${formatConsoleArgs(args)}\n`);
  };
  console.error = (...args) => {
    originalConsole.error(...args);
    logger.stream.write(`${formatConsoleArgs(args)}\n`);
  };
}

function formatConsoleArgs(args) {
  return args
    .map((arg) => {
      if (typeof arg === 'string') {
        return arg;
      }
      return String(arg);
    })
    .join(' ');
}

function pipeChildOutput(child, logStream, label) {
  child.stdout?.on('data', (chunk) => {
    writeConsoleLine('stdout', logStream, chunk);
  });
  child.stderr?.on('data', (chunk) => {
    writeConsoleLine('stderr', logStream, chunk);
  });
  child.on('error', (error) => {
    const message = `[${label}] ${error instanceof Error ? error.stack || error.message : String(error)}\n`;
    writeConsoleLine('stderr', logStream, message);
  });
}

function writeConsoleLine(target, logStream, chunk) {
  const text = typeof chunk === 'string' ? chunk : chunk.toString();
  if (target === 'stderr') {
    process.stderr.write(text);
  } else {
    process.stdout.write(text);
  }
  if (logStream) {
    logStream.write(text);
  }
}

async function createAppLauncher(applicationPath) {
  const launcherPath = path.join(artifactsDir, 'launch-tauri-app.sh');
  const appLogPath = path.join(artifactsDir, 'tauri-app.log');
  const escapedAppPath = shellEscape(applicationPath);
  const escapedAppLogPath = shellEscape(appLogPath);
  const script = `#!/usr/bin/env bash
set -euo pipefail
${escapedAppPath} "$@" 2>&1 | tee -a ${escapedAppLogPath}
`;
  await writeFile(launcherPath, script, { mode: 0o755 });
  await chmod(launcherPath, 0o755);
  return launcherPath;
}

function shellEscape(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function closeStream(stream) {
  if (!stream) {
    return;
  }
  await new Promise((resolve) => {
    stream.end(resolve);
  });
}
