import { spawn } from 'node:child_process';
import fs, { constants as fsConstants } from 'node:fs';
import { access, appendFile, chmod, copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
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
const preserveAppBinaryOnFailure =
  process.env.DGRID_E2E_PRESERVE_APP_BINARY_ON_FAILURE === '1' ||
  process.env.GITHUB_ACTIONS === 'true';
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
let runtimeMetadata;

try {
  await prepareArtifactsDir();
  harnessLogger = createLogger('harness');
  redirectConsoleToLog(harnessLogger);
  await ensureDriverInstalled();
  const toolVersions = await collectToolVersions();
  await runCommand('pnpm', ['tauri', 'build', '--debug', '--no-bundle', '--ci'], {
    cwd: repoRoot,
    logger: harnessLogger,
  });

  const { MongoMemoryServer } = await import('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();

  tempDir = await createTempDir();
  const applicationBinaryPath = await resolveApplicationPath();
  const applicationBinaryStats = await stat(applicationBinaryPath);
  appLauncherPath = await createAppLauncher(applicationBinaryPath);
  const driverCommand = getDriverCommand();
  const mongoUrl = new URL(mongod.getUri());
  runtimeMetadata = {
    startedAt: new Date().toISOString(),
    ci: isCi,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    driverCommand,
    driverBinaryPath: await resolveExecutablePath(driverCommand),
    toolVersions,
    mongo: {
      host: mongoUrl.hostname,
      port: parseInt(mongoUrl.port, 10),
    },
    dataDir: tempDir,
    applicationPath: appLauncherPath,
    applicationBinaryPath,
    applicationBinarySizeBytes: applicationBinaryStats.size,
    webdriverPort: driverPort,
    artifactsDir,
  };

  await mkdir(path.dirname(runtimeFile), { recursive: true });
  await writeFile(runtimeFile, JSON.stringify(runtimeMetadata, null, 2));
  await writeFile(runtimeMetadataFile, JSON.stringify(runtimeMetadata, null, 2));
  harnessLogger.info(`E2E artifacts directory: ${artifactsDir}`);
  harnessLogger.info(`Runtime file: ${runtimeFile}`);
  harnessLogger.info(`Runtime metadata: ${runtimeMetadataFile}`);
  logRuntimeMetadata(runtimeMetadata, harnessLogger);

  driverLogStream = fs.createWriteStream(path.join(artifactsDir, 'tauri-webdriver.log'), {
    flags: 'a',
  });

  tauriDriverProcess = spawn(driverCommand, [], {
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

  if (testFailure && preserveAppBinaryOnFailure && runtimeMetadata?.applicationBinaryPath) {
    const preservedBinaryPath = await preserveBuiltBinary(runtimeMetadata.applicationBinaryPath);
    if (preservedBinaryPath) {
      runtimeMetadata = {
        ...runtimeMetadata,
        preservedApplicationBinaryPath: preservedBinaryPath,
      };
      await writeFile(runtimeMetadataFile, JSON.stringify(runtimeMetadata, null, 2));
      harnessLogger?.info(`Preserved failed-run app binary: ${preservedBinaryPath}`);
    }
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

async function collectToolVersions() {
  const entries = await Promise.all([
    resolveVersionEntry('node', process.execPath, [process.execPath, '--version']),
    resolveVersionEntry('pnpm', 'pnpm', ['pnpm', '--version']),
    resolveVersionEntry('rustc', 'rustc', ['rustc', '--version']),
    resolveVersionEntry('cargo', 'cargo', ['cargo', '--version']),
    resolveVersionEntry('tauriCli', 'pnpm', ['pnpm', 'exec', 'tauri', '--version']),
    resolveVersionEntry('tauriWebdriver', getDriverCommand(), [getDriverCommand(), '--version']),
  ]);

  return Object.fromEntries(entries.map(({ key, value }) => [key, value]));
}

async function resolveVersionEntry(key, executable, command) {
  const executablePath = await resolveExecutablePath(executable);
  const version = executablePath ? await tryGetCommandOutput(command[0], command.slice(1)) : null;

  return {
    key,
    value: {
      path: executablePath,
      version,
    },
  };
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

async function resolveExecutablePath(command) {
  if (!command) {
    return null;
  }

  if (command.includes(path.sep)) {
    const absolutePath = path.resolve(command);
    try {
      await access(absolutePath, fsConstants.X_OK);
      return absolutePath;
    } catch {
      return null;
    }
  }

  const pathEnv = process.env.PATH || '';
  for (const directory of pathEnv.split(path.delimiter)) {
    if (!directory) {
      continue;
    }

    const candidate = path.join(directory, command);
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
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
  const runtime = await readRuntimeMetadata();

  let xml;
  try {
    xml = await fs.promises.readFile(junitReportFile, 'utf8');
  } catch {
    return `${buildSummaryLines(fallbackLines, runtime).join('\n')}\n`;
  }

  const suites = parseJUnitSuites(xml);
  if (suites.length === 0) {
    return `${buildSummaryLines(fallbackLines, runtime).join('\n')}\n`;
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
  return `${buildSummaryLines(lines, runtime).join('\n')}\n`;
}

function buildSummaryLines(lines, runtime) {
  if (!runtime) {
    return lines;
  }

  const summaryLines = [...lines];
  summaryLines.push('', '### Runtime');
  summaryLines.push(`- Application launcher: \`${runtime.applicationPath}\``);
  summaryLines.push(`- Application binary: \`${runtime.applicationBinaryPath}\``);
  summaryLines.push(
    `- Application binary size: ${formatByteSize(runtime.applicationBinarySizeBytes || 0)}`
  );
  summaryLines.push(`- WebDriver command: \`${runtime.driverCommand || 'tauri-webdriver'}\``);
  if (runtime.driverBinaryPath) {
    summaryLines.push(`- WebDriver binary: \`${runtime.driverBinaryPath}\``);
  }
  summaryLines.push(`- WebDriver port: ${runtime.webdriverPort}`);
  summaryLines.push(`- Mongo endpoint: ${runtime.mongo.host}:${runtime.mongo.port}`);
  if (runtime.preservedApplicationBinaryPath) {
    summaryLines.push(
      `- Preserved failed-run binary: \`${runtime.preservedApplicationBinaryPath}\``
    );
  }

  const toolVersionLines = formatToolVersionLines(runtime.toolVersions);
  if (toolVersionLines.length > 0) {
    summaryLines.push('', '### Tool Versions', ...toolVersionLines);
  }

  return summaryLines;
}

async function readRuntimeMetadata() {
  try {
    const contents = await fs.promises.readFile(runtimeMetadataFile, 'utf8');
    return JSON.parse(contents);
  } catch {
    return null;
  }
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

function formatByteSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatToolVersionLines(toolVersions) {
  if (!toolVersions || typeof toolVersions !== 'object') {
    return [];
  }

  const labels = {
    node: 'Node.js',
    pnpm: 'pnpm',
    rustc: 'rustc',
    cargo: 'cargo',
    tauriCli: 'Tauri CLI',
    tauriWebdriver: 'tauri-webdriver',
  };

  return Object.entries(labels).flatMap(([key, label]) => {
    const entry = toolVersions[key];
    if (!entry) {
      return [];
    }

    const parts = [];
    if (entry.version) {
      parts.push(entry.version);
    }
    if (entry.path) {
      parts.push(`path: \`${entry.path}\``);
    }
    return parts.length > 0 ? [`- ${label}: ${parts.join(' | ')}`] : [];
  });
}

async function preserveBuiltBinary(applicationBinaryPath) {
  try {
    await access(applicationBinaryPath, fsConstants.R_OK);
  } catch {
    return null;
  }

  const destinationDir = path.join(artifactsDir, 'preserved-app');
  await mkdir(destinationDir, { recursive: true });
  const destinationPath = path.join(destinationDir, path.basename(applicationBinaryPath));
  await copyFile(applicationBinaryPath, destinationPath);
  return destinationPath;
}

async function tryGetCommandOutput(command, args) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', () => resolve(null));
    child.on('exit', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      resolve((stdout || stderr).trim() || null);
    });
  });
}

function logRuntimeMetadata(runtime, logger) {
  logger.info(`Application launcher: ${runtime.applicationPath}`);
  logger.info(`Application binary: ${runtime.applicationBinaryPath}`);
  logger.info(`Application binary size: ${formatByteSize(runtime.applicationBinarySizeBytes)}`);
  logger.info(`WebDriver command: ${runtime.driverCommand}`);
  if (runtime.driverBinaryPath) {
    logger.info(`WebDriver binary: ${runtime.driverBinaryPath}`);
  }
  logger.info(`WebDriver port: ${runtime.webdriverPort}`);
  logger.info(`Mongo endpoint: ${runtime.mongo.host}:${runtime.mongo.port}`);
  for (const line of formatToolVersionLines(runtime.toolVersions)) {
    logger.info(line.replace(/^- /, ''));
  }
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
