#!/usr/bin/env tsx
/**
 * Release script for DGrid
 *
 * Usage: tsx scripts/release.ts [version]
 *
 * This script:
 * 1. Builds the Tauri app (includes platform-specific installers)
 * 2. Generates SHA256 checksums for release artifacts
 * 3. Outputs Homebrew Cask snippet
 */

import { execSync } from 'child_process';
import { createReadStream, existsSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const ROOT_DIR = process.cwd();

function getVersion(): string {
  const version = process.argv[2];
  if (version) return version;

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

  // Build Tauri app
  console.log('Building Tauri app...');
  execSync('pnpm tauri build', { stdio: 'inherit', cwd: ROOT_DIR });

  // Find release artifacts in Tauri's output directory
  const bundleDir = join(ROOT_DIR, 'src-tauri/target/release/bundle');
  const artifacts: Array<{ name: string; path: string; sha256: string }> = [];

  console.log('\nCalculating SHA256 checksums...');

  // Check for DMG (macOS)
  const dmgDir = join(bundleDir, 'dmg');
  if (existsSync(dmgDir)) {
    for (const file of readdirSync(dmgDir).filter((f) => f.endsWith('.dmg'))) {
      const filePath = join(dmgDir, file);
      const sha256 = await calculateSha256(filePath);
      writeFileSync(`${filePath}.sha256`, `${sha256}  ${file}\n`);
      artifacts.push({ name: file, path: filePath, sha256 });
    }
  }

  // Check for NSIS (Windows)
  const nsisDir = join(bundleDir, 'nsis');
  if (existsSync(nsisDir)) {
    for (const file of readdirSync(nsisDir).filter((f) => f.endsWith('.exe'))) {
      const filePath = join(nsisDir, file);
      const sha256 = await calculateSha256(filePath);
      writeFileSync(`${filePath}.sha256`, `${sha256}  ${file}\n`);
      artifacts.push({ name: file, path: filePath, sha256 });
    }
  }

  // Check for deb/AppImage (Linux)
  const debDir = join(bundleDir, 'deb');
  if (existsSync(debDir)) {
    for (const file of readdirSync(debDir).filter((f) => f.endsWith('.deb'))) {
      const filePath = join(debDir, file);
      const sha256 = await calculateSha256(filePath);
      writeFileSync(`${filePath}.sha256`, `${sha256}  ${file}\n`);
      artifacts.push({ name: file, path: filePath, sha256 });
    }
  }

  const appimageDir = join(bundleDir, 'appimage');
  if (existsSync(appimageDir)) {
    for (const file of readdirSync(appimageDir).filter((f) => f.endsWith('.AppImage'))) {
      const filePath = join(appimageDir, file);
      const sha256 = await calculateSha256(filePath);
      writeFileSync(`${filePath}.sha256`, `${sha256}  ${file}\n`);
      artifacts.push({ name: file, path: filePath, sha256 });
    }
  }

  if (artifacts.length === 0) {
    console.warn(`\nWarning: No release artifacts found in ${bundleDir}`);
  }

  // Print summary
  console.log(`\nRelease artifacts:`);
  for (const artifact of artifacts) {
    console.log(`  - ${artifact.name}`);
    console.log(`    SHA256: ${artifact.sha256}`);
    console.log(`    Path: ${artifact.path}`);
  }

  // Output Homebrew Cask snippet
  const arm64Sha =
    artifacts.find((a) => a.name.includes('aarch64') || a.name.includes('arm64'))?.sha256 ??
    'REPLACE_WITH_ARM64_SHA256';
  const x64Sha =
    artifacts.find((a) => a.name.includes('x64') || a.name.includes('x86_64'))?.sha256 ??
    'REPLACE_WITH_X64_SHA256';

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
