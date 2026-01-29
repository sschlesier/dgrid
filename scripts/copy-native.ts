#!/usr/bin/env tsx
/**
 * Copy native modules for SEA distribution
 *
 * Native Node.js addons (.node files) cannot be bundled into SEA.
 * They must be distributed alongside the executable.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

const ROOT_DIR = process.cwd();
const NODE_MODULES = join(ROOT_DIR, 'node_modules');
const OUTPUT_DIR = join(ROOT_DIR, 'dist/sea/native');

// Native modules that need to be copied
const NATIVE_MODULES = [
  '@napi-rs/keyring', // macOS keychain integration
];

function findNodeFiles(dir: string): string[] {
  const nodeFiles: string[] = [];

  function walk(currentDir: string): void {
    if (!existsSync(currentDir)) return;

    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry.endsWith('.node')) {
        nodeFiles.push(fullPath);
      }
    }
  }

  walk(dir);
  return nodeFiles;
}

function copyNativeModules(): void {
  console.log('Copying native modules...');

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let copiedCount = 0;

  for (const moduleName of NATIVE_MODULES) {
    const moduleDir = join(NODE_MODULES, moduleName);

    if (!existsSync(moduleDir)) {
      console.warn(`  Warning: Module not found: ${moduleName}`);
      continue;
    }

    const nodeFiles = findNodeFiles(moduleDir);

    for (const nodeFile of nodeFiles) {
      const destName = `${moduleName.replace('/', '-')}-${basename(nodeFile)}`;
      const destPath = join(OUTPUT_DIR, destName);

      copyFileSync(nodeFile, destPath);
      console.log(`  Copied: ${destName}`);
      copiedCount++;
    }
  }

  console.log(`\nCopied ${copiedCount} native module files to ${OUTPUT_DIR}`);
}

copyNativeModules();
