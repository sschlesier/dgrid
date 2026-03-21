import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeFile = process.env.DGRID_E2E_RUNTIME_FILE;
if (!runtimeFile || !fs.existsSync(runtimeFile)) {
  throw new Error('DGRID_E2E_RUNTIME_FILE must point to an existing runtime file');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtime = JSON.parse(fs.readFileSync(runtimeFile, 'utf8'));
const isCi = process.env.DGRID_E2E_CI === '1' || process.env.CI === 'true';
const junitOutputFile = process.env.DGRID_E2E_JUNIT_FILE;
const failureArtifactsDir = path.join(runtime.artifactsDir, 'failure-artifacts');

const reporters = ['spec'];
if (junitOutputFile) {
  reporters.push([
    'junit',
    {
      outputDir: path.dirname(junitOutputFile),
      outputFileFormat: () => path.basename(junitOutputFile),
      addFileAttribute: true,
      packageName: 'dgrid-webdriver-e2e',
    },
  ]);
}

export const config = {
  runner: 'local',
  specs: [path.join(__dirname, 'specs', '**/*.e2e.mjs')],
  maxInstances: 1,
  hostname: '127.0.0.1',
  port: runtime.webdriverPort,
  path: '/',
  logLevel: 'warn',
  logLevels: {
    webdriver: 'silent',
  },
  framework: 'mocha',
  reporters,
  waitforTimeout: isCi ? 20_000 : 10_000,
  connectionRetryCount: isCi ? 2 : 1,
  connectionRetryTimeout: isCi ? 60_000 : 30_000,
  mochaOpts: {
    ui: 'bdd',
    timeout: isCi ? 90_000 : 60_000,
  },
  capabilities: [
    {
      browserName: 'wry',
      'tauri:options': {
        application: path.resolve(runtime.applicationPath),
      },
    },
  ],
  afterTest: async function (test, _context, result) {
    if (result.passed) {
      return;
    }

    await captureFailureArtifacts({
      kind: 'test',
      suiteTitle: test.parent,
      title: test.title,
      error: result.error,
    });
  },
  afterHook: async function (test, _context, result) {
    if (!result?.error) {
      return;
    }

    const hookTitle = result.title || result.hookName || 'hook failure';
    await captureFailureArtifacts({
      kind: 'hook',
      suiteTitle: test?.parent,
      title: `${test?.title ? `${test.title} ` : ''}${hookTitle}`.trim(),
      error: result.error,
    });
  },
};

async function captureFailureArtifacts({ kind, suiteTitle, title, error }) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `${timestamp}-${sanitizePathSegment(suiteTitle || 'unknown-suite')}-${sanitizePathSegment(title || kind)}`;
  const artifactDir = path.join(failureArtifactsDir, baseName);
  fs.mkdirSync(artifactDir, { recursive: true });

  const pageSourcePath = path.join(artifactDir, 'page-source.html');
  const screenshotPath = path.join(artifactDir, 'screenshot.png');
  const metadataPath = path.join(artifactDir, 'failure.json');

  let pageSourceError;
  try {
    const source = await browser.getPageSource();
    fs.writeFileSync(pageSourcePath, source, 'utf8');
  } catch (captureError) {
    pageSourceError = formatError(captureError);
  }

  let screenshotError;
  try {
    await browser.saveScreenshot(screenshotPath);
  } catch (captureError) {
    screenshotError = formatError(captureError);
  }

  const metadata = {
    kind,
    capturedAt: new Date().toISOString(),
    suiteTitle: suiteTitle || '',
    title: title || '',
    pageSourcePath,
    screenshotPath,
    error: formatError(error),
    pageSourceCaptureError: pageSourceError || null,
    screenshotCaptureError: screenshotError || null,
  };
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  console.error(`Saved failure artifacts to ${artifactDir}`);
}

function sanitizePathSegment(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'unnamed';
}

function formatError(error) {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}
