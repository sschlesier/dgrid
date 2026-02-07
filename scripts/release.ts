#!/usr/bin/env tsx
/**
 * Release script for DGrid
 *
 * Usage: tsx scripts/release.ts [version]
 *
 * This script:
 * 1. Builds the SEA executable (includes .app bundle + DMG on macOS)
 * 2. Creates a tar.gz archive (for Homebrew)
 * 3. Generates SHA256 checksums for all artifacts
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

  // Build SEA (includes .app bundle + DMG on macOS)
  console.log('Building SEA executable...');
  execSync('pnpm sea:build', { stdio: 'inherit', cwd: ROOT_DIR });

  // Create release directory
  if (!existsSync(RELEASE_DIR)) {
    mkdirSync(RELEASE_DIR, { recursive: true });
  }

  // Create tar.gz archive for Homebrew
  const archiveName = `dgrid-${version}-${target}.tar.gz`;
  const archivePath = join(RELEASE_DIR, archiveName);

  console.log(`\nCreating archive: ${archiveName}`);

  if (process.platform === 'darwin') {
    // On macOS, binary and support files are inside the .app bundle
    const macosDir = join(DIST_DIR, 'DGrid.app/Contents/MacOS');
    execSync(`tar -czvf "${archivePath}" dgrid native/ traybin/`, {
      cwd: macosDir,
      stdio: 'inherit',
    });
  } else {
    execSync(`tar -czvf "${archivePath}" dgrid native/ traybin/`, {
      cwd: DIST_DIR,
      stdio: 'inherit',
    });
  }

  // Calculate checksum for tar.gz
  console.log('\nCalculating SHA256 checksums...');
  const sha256 = await calculateSha256(archivePath);
  const checksumPath = `${archivePath}.sha256`;
  writeFileSync(checksumPath, `${sha256}  ${archiveName}\n`);

  const artifacts: Array<{ name: string; sha256: string }> = [{ name: archiveName, sha256 }];

  // Handle DMG on macOS (already created by sea:build)
  const dmgName = `DGrid-${version}-${process.arch}.dmg`;
  const dmgPath = join(RELEASE_DIR, dmgName);

  if (existsSync(dmgPath)) {
    const dmgSha256 = await calculateSha256(dmgPath);
    const dmgChecksumPath = `${dmgPath}.sha256`;
    writeFileSync(dmgChecksumPath, `${dmgSha256}  ${dmgName}\n`);
    artifacts.push({ name: dmgName, sha256: dmgSha256 });
  }

  // Print summary
  console.log(`\nRelease artifacts created in ${RELEASE_DIR}:`);
  for (const artifact of artifacts) {
    console.log(`  - ${artifact.name}`);
    console.log(`    SHA256: ${artifact.sha256}`);
  }

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
