#!/usr/bin/env tsx
/**
 * Release script for DGrid
 *
 * Usage: tsx scripts/release.ts [version]
 *
 * This script:
 * 1. Builds the SEA executable (includes .app bundle + DMG on macOS)
 * 2. Generates SHA256 checksums for DMG artifacts
 * 3. Outputs Homebrew Cask snippet
 */

import { execSync } from 'child_process';
import { createReadStream, existsSync, writeFileSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const ROOT_DIR = process.cwd();
const RELEASE_DIR = join(ROOT_DIR, 'dist/release');

function getVersion(): string {
  const version = process.argv[2];
  if (version) return version;

  // Read from package.json
  const pkg = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf-8'));
  return pkg.version;
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

  console.log(`Building DGrid v${version}...\n`);

  // Build SEA (includes .app bundle + DMG on macOS)
  console.log('Building SEA executable...');
  execSync('pnpm sea:build', { stdio: 'inherit', cwd: ROOT_DIR });

  // Generate checksums for release artifacts
  const artifacts: Array<{ name: string; sha256: string }> = [];

  const dmgName = `DGrid-${version}-${process.arch}.dmg`;
  const dmgPath = join(RELEASE_DIR, dmgName);
  const zipName = `DGrid-${version}-win-x64.zip`;
  const zipPath = join(RELEASE_DIR, zipName);

  console.log('\nCalculating SHA256 checksums...');

  if (existsSync(dmgPath)) {
    const dmgSha256 = await calculateSha256(dmgPath);
    const dmgChecksumPath = `${dmgPath}.sha256`;
    writeFileSync(dmgChecksumPath, `${dmgSha256}  ${dmgName}\n`);
    artifacts.push({ name: dmgName, sha256: dmgSha256 });
  }

  if (existsSync(zipPath)) {
    const zipSha256 = await calculateSha256(zipPath);
    const zipChecksumPath = `${zipPath}.sha256`;
    writeFileSync(zipChecksumPath, `${zipSha256}  ${zipName}\n`);
    artifacts.push({ name: zipName, sha256: zipSha256 });
  }

  if (artifacts.length === 0) {
    console.warn(`\nWarning: No release artifacts found in ${RELEASE_DIR}`);
  }

  // Print summary
  console.log(`\nRelease artifacts in ${RELEASE_DIR}:`);
  for (const artifact of artifacts) {
    console.log(`  - ${artifact.name}`);
    console.log(`    SHA256: ${artifact.sha256}`);
  }

  // Output Homebrew Cask snippet
  const arm64Sha =
    artifacts.find((a) => a.name.includes('arm64'))?.sha256 ?? 'REPLACE_WITH_ARM64_SHA256';
  const x64Sha = artifacts.find((a) => a.name.includes('x64'))?.sha256 ?? 'REPLACE_WITH_X64_SHA256';

  console.log('\n--- Homebrew Cask Snippet ---\n');
  console.log(`  version "${version}"`);
  console.log(`  # arm64: sha256 "${arm64Sha}"`);
  console.log(`  # x64:   sha256 "${x64Sha}"`);
  console.log('\n-----------------------------\n');
}

main().catch((error) => {
  console.error('Release failed:', error);
  process.exit(1);
});
