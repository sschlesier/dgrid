#!/usr/bin/env tsx
/**
 * Release script for DGrid
 *
 * Usage: tsx scripts/release.ts [version]
 *
 * This script:
 * 1. Builds the SEA executable
 * 2. Creates a tar.gz archive
 * 3. Generates SHA256 checksum
 * 4. Outputs Homebrew formula snippet
 */

import { execSync } from 'child_process';
import { createReadStream, existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const ROOT_DIR = process.cwd();
const DIST_DIR = join(ROOT_DIR, 'dist/sea');
const RELEASE_DIR = join(ROOT_DIR, 'dist/release');

function getVersion(): string {
  const version = process.argv[2];
  if (version) return version;

  // Read from package.json
  const pkg = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf-8'));
  return pkg.version;
}

function getTarget(): string {
  const arch = process.arch; // arm64, x64
  const platform = process.platform; // darwin, linux, win32
  return `${platform}-${arch}`;
}

async function calculateSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function main(): Promise<void> {
  const version = getVersion();
  const target = getTarget();

  console.log(`Building DGrid v${version} for ${target}...\n`);

  // Build SEA
  console.log('Building SEA executable...');
  execSync('pnpm sea:build', { stdio: 'inherit', cwd: ROOT_DIR });

  // Create release directory
  if (!existsSync(RELEASE_DIR)) {
    mkdirSync(RELEASE_DIR, { recursive: true });
  }

  // Create archive
  const archiveName = `dgrid-${version}-${target}.tar.gz`;
  const archivePath = join(RELEASE_DIR, archiveName);

  console.log(`\nCreating archive: ${archiveName}`);
  execSync(`tar -czvf "${archivePath}" dgrid native/`, {
    cwd: DIST_DIR,
    stdio: 'inherit',
  });

  // Calculate checksum
  console.log('\nCalculating SHA256 checksum...');
  const sha256 = await calculateSha256(archivePath);
  const checksumPath = `${archivePath}.sha256`;
  writeFileSync(checksumPath, `${sha256}  ${archiveName}\n`);

  console.log(`\nRelease artifacts created in ${RELEASE_DIR}:`);
  console.log(`  - ${archiveName}`);
  console.log(`  - ${archiveName}.sha256`);
  console.log(`\nSHA256: ${sha256}`);

  // Output Homebrew formula snippet
  console.log('\n--- Homebrew Formula Snippet ---\n');
  console.log(
    `  url "https://github.com/OWNER/dgrid/releases/download/v${version}/${archiveName}"`
  );
  console.log(`  sha256 "${sha256}"`);
  console.log('\n--------------------------------\n');
}

main().catch((error) => {
  console.error('Release failed:', error);
  process.exit(1);
});
