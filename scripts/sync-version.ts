#!/usr/bin/env tsx
/**
 * Sync version from package.json to Tauri config and Cargo.toml.
 *
 * Called automatically by the pnpm "version" lifecycle hook so that
 * `pnpm version patch|minor|major` keeps all three version files in sync.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT_DIR = process.cwd();

function main(): void {
  const pkg = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf-8'));
  const version: string = pkg.version;

  console.log(`Syncing version ${version} to Tauri config and Cargo.toml...`);

  // Update tauri.conf.json
  const tauriConfPath = join(ROOT_DIR, 'src-tauri/tauri.conf.json');
  const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf-8'));
  tauriConf.version = version;
  writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');

  // Update Cargo.toml
  const cargoPath = join(ROOT_DIR, 'src-tauri/Cargo.toml');
  const cargo = readFileSync(cargoPath, 'utf-8');
  const updated = cargo.replace(/^version = ".*"/m, `version = "${version}"`);
  writeFileSync(cargoPath, updated);

  // Regenerate Cargo.lock
  execSync('cargo generate-lockfile', { cwd: join(ROOT_DIR, 'src-tauri'), stdio: 'inherit' });

  // Stage the updated files so they're included in pnpm's version commit
  execSync('git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock', {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  console.log('Version synced successfully.');
}

main();
