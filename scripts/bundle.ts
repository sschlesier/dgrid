#!/usr/bin/env tsx
/**
 * Bundle backend for SEA (Single Executable Application)
 *
 * Uses esbuild to:
 * - Bundle all ESM backend code into a single file
 * - Convert to CommonJS format (required for SEA)
 * - Mark native modules as external
 */

import * as esbuild from 'esbuild';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRY_POINT = join(ROOT_DIR, 'src/backend/server.ts');
const OUT_FILE = join(ROOT_DIR, 'dist/sea/server.cjs');

function getVersion(): string {
  const pkg = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf-8'));
  return pkg.version;
}

// Native modules that can't be bundled - must be loaded at runtime
const EXTERNAL_MODULES = [
  '@napi-rs/keyring', // Native keyring binding
];

async function bundle(): Promise<void> {
  console.log('Bundling backend for SEA...');

  // Ensure output directory exists
  const outDir = dirname(OUT_FILE);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  try {
    const result = await esbuild.build({
      entryPoints: [ENTRY_POINT],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'cjs', // SEA requires CommonJS
      outfile: OUT_FILE,
      external: EXTERNAL_MODULES,
      define: {
        DGRID_VERSION: JSON.stringify(getVersion()),
      },
      minify: false, // Keep readable for debugging
      sourcemap: false,
      metafile: true,
      logLevel: 'info',
      // Handle ESM to CJS conversion and set production defaults
      banner: {
        js: `
// ESM compatibility shims for bundled code
const { createRequire } = require('module');
const __require = createRequire(__filename);
// Default to production mode for bundled builds
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';
`.trim(),
      },
    });

    // Log bundle stats
    const outputs = Object.entries(result.metafile?.outputs ?? {});
    for (const [file, info] of outputs) {
      const sizeKB = (info.bytes / 1024).toFixed(1);
      console.log(`  ${file}: ${sizeKB} KB`);
    }

    console.log('\nBundle complete!');
    console.log(`Output: ${OUT_FILE}`);
  } catch (error) {
    console.error('Bundle failed:', error);
    process.exit(1);
  }
}

bundle();
