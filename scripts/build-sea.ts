#!/usr/bin/env tsx
/**
 * Build Single Executable Application (SEA) for Node.js 22+
 *
 * This script:
 * 1. Generates sea-config.json with all frontend assets embedded
 * 2. Creates the SEA blob using Node.js
 * 3. Copies the Node.js binary and injects the blob
 * 4. Signs the binary for macOS
 */

import { execSync } from 'child_process';
import {
  readdirSync,
  statSync,
  writeFileSync,
  copyFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  rmSync,
} from 'fs';
import { join } from 'path';

const ROOT_DIR = process.cwd();
const DIST_SEA_DIR = join(ROOT_DIR, 'dist/sea');
const FRONTEND_DIR = join(ROOT_DIR, 'dist/frontend');
const BUNDLE_FILE = join(DIST_SEA_DIR, 'server.cjs');
const SEA_CONFIG = join(DIST_SEA_DIR, 'sea-config.json');
const SEA_BLOB = join(DIST_SEA_DIR, 'sea-prep.blob');
const OUTPUT_BINARY = join(DIST_SEA_DIR, 'dgrid');

interface SeaConfig {
  main: string;
  output: string;
  disableExperimentalSEAWarning: boolean;
  useSnapshot: boolean;
  useCodeCache: boolean;
  assets: Record<string, string>;
}

function collectAssets(dir: string, basePath: string = ''): Record<string, string> {
  const assets: Record<string, string> = {};
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relativePath = basePath ? `${basePath}/${entry}` : entry;
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      Object.assign(assets, collectAssets(fullPath, relativePath));
    } else {
      // Asset key is the path used to retrieve it at runtime
      assets[`frontend/${relativePath}`] = fullPath;
    }
  }

  return assets;
}

function generateSeaConfig(): void {
  console.log('Generating SEA configuration...');

  if (!existsSync(BUNDLE_FILE)) {
    throw new Error(`Bundle not found: ${BUNDLE_FILE}. Run 'pnpm bundle' first.`);
  }

  if (!existsSync(FRONTEND_DIR)) {
    throw new Error(`Frontend not found: ${FRONTEND_DIR}. Run 'pnpm build:frontend' first.`);
  }

  // Collect all frontend assets
  const assets = collectAssets(FRONTEND_DIR);

  const config: SeaConfig = {
    main: BUNDLE_FILE,
    output: SEA_BLOB,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: true,
    assets,
  };

  writeFileSync(SEA_CONFIG, JSON.stringify(config, null, 2));
  console.log(`  Assets: ${Object.keys(assets).length} files`);
}

function createSeaBlob(): void {
  console.log('Creating SEA blob...');

  execSync(`node --experimental-sea-config "${SEA_CONFIG}"`, {
    stdio: 'inherit',
    cwd: ROOT_DIR,
  });
}

function createExecutable(): void {
  console.log('Creating executable...');

  // Get the current Node.js binary
  const nodeBinary = process.execPath;

  // Copy Node.js binary
  copyFileSync(nodeBinary, OUTPUT_BINARY);
  chmodSync(OUTPUT_BINARY, 0o755);

  // Remove existing code signature on macOS
  if (process.platform === 'darwin') {
    console.log('  Removing code signature...');
    try {
      execSync(`codesign --remove-signature "${OUTPUT_BINARY}"`, {
        stdio: 'pipe',
      });
    } catch {
      // Ignore if no signature exists
    }
  }

  // Inject the blob using postject
  console.log('  Injecting SEA blob...');

  // Check if postject is available
  try {
    execSync('npx postject --help', { stdio: 'pipe' });
  } catch {
    console.log('  Installing postject...');
    execSync('npm install -g postject', { stdio: 'inherit' });
  }

  const postjectArgs = [
    `"${OUTPUT_BINARY}"`,
    'NODE_SEA_BLOB',
    `"${SEA_BLOB}"`,
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ];

  if (process.platform === 'darwin') {
    postjectArgs.push('--macho-segment-name', 'NODE_SEA');
  }

  execSync(`npx postject ${postjectArgs.join(' ')}`, {
    stdio: 'inherit',
    cwd: ROOT_DIR,
  });
}

function signBinary(): void {
  if (process.platform !== 'darwin') {
    return;
  }

  console.log('Signing binary (ad-hoc)...');
  execSync(`codesign --sign - "${OUTPUT_BINARY}"`, {
    stdio: 'inherit',
  });
}

function copyNativeModules(): void {
  console.log('Copying native modules...');

  const nativeDir = join(DIST_SEA_DIR, 'native');
  if (!existsSync(nativeDir)) {
    mkdirSync(nativeDir, { recursive: true });
  }

  // Determine platform-specific package name
  const arch = process.arch; // arm64, x64
  const platform = process.platform; // darwin, linux, win32
  const platformPackage = `@napi-rs/keyring-${platform}-${arch}`;

  // Look for platform-specific keyring native module
  const keyringPlatformDir = join(ROOT_DIR, 'node_modules', platformPackage);

  if (existsSync(keyringPlatformDir)) {
    const entries = readdirSync(keyringPlatformDir);
    for (const entry of entries) {
      if (entry.endsWith('.node')) {
        const srcPath = join(keyringPlatformDir, entry);
        const destPath = join(nativeDir, entry);
        copyFileSync(srcPath, destPath);
        console.log(`  Copied: ${entry}`);
      }
    }
  } else {
    // Try finding in @napi-rs directory
    const napirsDir = join(ROOT_DIR, 'node_modules/@napi-rs');
    if (existsSync(napirsDir)) {
      const packages = readdirSync(napirsDir);
      for (const pkg of packages) {
        if (pkg.startsWith('keyring-')) {
          const pkgDir = join(napirsDir, pkg);
          const entries = readdirSync(pkgDir);
          for (const entry of entries) {
            if (entry.endsWith('.node')) {
              const srcPath = join(pkgDir, entry);
              const destPath = join(nativeDir, entry);
              copyFileSync(srcPath, destPath);
              console.log(`  Copied: ${entry}`);
            }
          }
        }
      }
    }
  }
}

function cleanup(): void {
  console.log('Cleaning up...');
  // Remove intermediate files
  rmSync(SEA_BLOB, { force: true });
  rmSync(SEA_CONFIG, { force: true });
}

function printStats(): void {
  const stats = statSync(OUTPUT_BINARY);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
  console.log(`\nSEA build complete!`);
  console.log(`  Output: ${OUTPUT_BINARY}`);
  console.log(`  Size: ${sizeMB} MB`);
  console.log(`\nRun with: ${OUTPUT_BINARY}`);
}

async function main(): Promise<void> {
  console.log('Building SEA for macOS...\n');

  // Ensure output directory exists
  if (!existsSync(DIST_SEA_DIR)) {
    mkdirSync(DIST_SEA_DIR, { recursive: true });
  }

  generateSeaConfig();
  createSeaBlob();
  createExecutable();
  signBinary();
  copyNativeModules();
  cleanup();
  printStats();
}

main().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
