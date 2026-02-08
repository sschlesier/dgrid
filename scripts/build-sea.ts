#!/usr/bin/env tsx
/**
 * Build Single Executable Application (SEA) for Node.js 22+
 *
 * This script:
 * 1. Generates sea-config.json with all frontend assets embedded
 * 2. Creates the SEA blob using Node.js
 * 3. Copies the Node.js binary and injects the blob
 * 4. Signs the binary for macOS
 * 5. Packages into macOS .app bundle / Windows zip
 * 6. Creates DMG installer (macOS) or zip archive (Windows)
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
  readFileSync,
  renameSync,
} from 'fs';
import { join } from 'path';

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const EXE_NAME = IS_WIN ? 'dgrid.exe' : 'dgrid';

const ROOT_DIR = process.cwd();
const DIST_SEA_DIR = join(ROOT_DIR, 'dist/sea');
const FRONTEND_DIR = join(ROOT_DIR, 'dist/frontend');
const BUNDLE_FILE = join(DIST_SEA_DIR, 'server.cjs');
const SEA_CONFIG = join(DIST_SEA_DIR, 'sea-config.json');
const SEA_BLOB = join(DIST_SEA_DIR, 'sea-prep.blob');
const OUTPUT_BINARY = join(DIST_SEA_DIR, EXE_NAME);
const APP_BUNDLE = join(DIST_SEA_DIR, 'DGrid.app');
const RELEASE_DIR = join(ROOT_DIR, 'dist/release');

function getVersion(): string {
  const pkg = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf-8'));
  return pkg.version;
}

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
  if (!IS_WIN) {
    chmodSync(OUTPUT_BINARY, 0o755);
  }

  // Remove existing code signature on macOS
  if (IS_MAC) {
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

  if (IS_MAC) {
    postjectArgs.push('--macho-segment-name', 'NODE_SEA');
  }

  execSync(`npx postject ${postjectArgs.join(' ')}`, {
    stdio: 'inherit',
    cwd: ROOT_DIR,
  });
}

function signBinary(): void {
  if (!IS_MAC) {
    return;
  }

  console.log('Signing binary (ad-hoc)...');
  execSync(`codesign --sign - "${OUTPUT_BINARY}"`, {
    stdio: 'inherit',
  });
}

function copyTrayBinary(): void {
  console.log('Copying tray binary...');

  const trayBinDir = join(DIST_SEA_DIR, 'traybin');
  if (!existsSync(trayBinDir)) {
    mkdirSync(trayBinDir, { recursive: true });
  }

  const platformBinNames: Record<string, string> = {
    darwin: 'tray_darwin_release',
    linux: 'tray_linux_release',
    win32: 'tray_windows_release.exe',
  };

  const binName = platformBinNames[process.platform];
  if (!binName) {
    console.warn(`  Warning: No tray binary for platform ${process.platform}`);
    return;
  }

  const srcPath = join(ROOT_DIR, 'node_modules/systray2/traybin', binName);
  if (existsSync(srcPath)) {
    const destPath = join(trayBinDir, binName);
    copyFileSync(srcPath, destPath);
    if (!IS_WIN) {
      chmodSync(destPath, 0o755);
    }
    console.log(`  Copied: ${binName}`);
  } else {
    console.warn(`  Warning: Tray binary not found: ${srcPath}`);
  }
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

function copyAppIcon(): void {
  if (IS_MAC) {
    const icnsSrc = join(ROOT_DIR, 'assets', 'dgrid.icns');
    const icnsDest = join(DIST_SEA_DIR, 'dgrid.icns');

    if (existsSync(icnsSrc)) {
      copyFileSync(icnsSrc, icnsDest);
      console.log('Copied app icon (.icns).');
    } else {
      console.warn('  Warning: assets/dgrid.icns not found, .app will have no icon');
    }
  } else if (IS_WIN) {
    const icoSrc = join(ROOT_DIR, 'assets', 'dgrid.ico');
    const icoDest = join(DIST_SEA_DIR, 'dgrid.ico');

    if (existsSync(icoSrc)) {
      copyFileSync(icoSrc, icoDest);
      console.log('Copied app icon (.ico).');
    } else {
      console.warn('  Warning: assets/dgrid.ico not found');
    }
  }
}

function createAppBundle(): void {
  if (!IS_MAC) {
    console.log('Skipping .app bundle (not macOS)');
    return;
  }

  console.log('Creating macOS .app bundle...');

  const version = getVersion();

  // Clean previous bundle
  rmSync(APP_BUNDLE, { recursive: true, force: true });

  // Create directory structure
  const contentsDir = join(APP_BUNDLE, 'Contents');
  const macosDir = join(contentsDir, 'MacOS');
  const resourcesDir = join(contentsDir, 'Resources');

  mkdirSync(macosDir, { recursive: true });
  mkdirSync(resourcesDir, { recursive: true });

  // Move binary into MacOS/
  renameSync(OUTPUT_BINARY, join(macosDir, 'dgrid'));

  // Move native/ and traybin/ into MacOS/ (alongside binary for path compat)
  const nativeSrc = join(DIST_SEA_DIR, 'native');
  const traybinSrc = join(DIST_SEA_DIR, 'traybin');

  if (existsSync(nativeSrc)) {
    renameSync(nativeSrc, join(macosDir, 'native'));
  }
  if (existsSync(traybinSrc)) {
    renameSync(traybinSrc, join(macosDir, 'traybin'));
  }

  // Copy icon to Resources/
  const icnsPath = join(DIST_SEA_DIR, 'dgrid.icns');
  if (existsSync(icnsPath)) {
    copyFileSync(icnsPath, join(resourcesDir, 'dgrid.icns'));
    rmSync(icnsPath, { force: true });
  }

  // Write Info.plist
  const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>dgrid</string>
  <key>CFBundleIdentifier</key>
  <string>com.dgrid.app</string>
  <key>CFBundleDisplayName</key>
  <string>DGrid</string>
  <key>CFBundleName</key>
  <string>DGrid</string>
  <key>CFBundleVersion</key>
  <string>${version}</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleIconFile</key>
  <string>dgrid</string>
  <key>LSUIElement</key>
  <true/>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
  writeFileSync(join(contentsDir, 'Info.plist'), infoPlist);

  // Write PkgInfo
  writeFileSync(join(contentsDir, 'PkgInfo'), 'APPL????');

  // Codesign the entire bundle
  console.log('  Signing .app bundle (ad-hoc)...');
  execSync(`codesign --force --deep --sign - "${APP_BUNDLE}"`, {
    stdio: 'inherit',
  });

  console.log(`  Created: DGrid.app`);
}

function createDmg(): void {
  if (!IS_MAC) {
    console.log('Skipping DMG (not macOS)');
    return;
  }

  if (!existsSync(APP_BUNDLE)) {
    console.log('Skipping DMG (.app bundle not found)');
    return;
  }

  console.log('Creating DMG installer...');

  const version = getVersion();
  const arch = process.arch;

  if (!existsSync(RELEASE_DIR)) {
    mkdirSync(RELEASE_DIR, { recursive: true });
  }

  const dmgName = `DGrid-${version}-${arch}.dmg`;
  const dmgPath = join(RELEASE_DIR, dmgName);

  // Remove existing DMG
  rmSync(dmgPath, { force: true });

  // Create a staging directory with .app and Applications symlink
  const stagingDir = join(DIST_SEA_DIR, 'dmg-staging');
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  // Copy .app to staging
  execSync(`cp -R "${APP_BUNDLE}" "${stagingDir}/"`, { stdio: 'pipe' });

  // Create Applications symlink for drag-to-install
  execSync(`ln -s /Applications "${join(stagingDir, 'Applications')}"`, {
    stdio: 'pipe',
  });

  // Create compressed DMG from staging directory
  execSync(
    `hdiutil create -volname "DGrid" -srcfolder "${stagingDir}" -ov -format UDZO "${dmgPath}"`,
    { stdio: 'inherit' }
  );

  // Cleanup staging
  rmSync(stagingDir, { recursive: true, force: true });

  const stats = statSync(dmgPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
  console.log(`  Created: ${dmgName} (${sizeMB} MB)`);
}

function createWindowsZip(): void {
  if (!IS_WIN) {
    return;
  }

  console.log('Creating Windows zip archive...');

  const version = getVersion();

  if (!existsSync(RELEASE_DIR)) {
    mkdirSync(RELEASE_DIR, { recursive: true });
  }

  const zipName = `DGrid-${version}-win-x64.zip`;
  const zipPath = join(RELEASE_DIR, zipName);

  // Remove existing zip
  rmSync(zipPath, { force: true });

  // Create staging directory
  const stagingDir = join(DIST_SEA_DIR, 'zip-staging', 'DGrid');
  rmSync(join(DIST_SEA_DIR, 'zip-staging'), { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  // Copy executable
  copyFileSync(OUTPUT_BINARY, join(stagingDir, EXE_NAME));

  // Copy native modules
  const nativeDir = join(DIST_SEA_DIR, 'native');
  if (existsSync(nativeDir)) {
    const destNative = join(stagingDir, 'native');
    mkdirSync(destNative, { recursive: true });
    for (const entry of readdirSync(nativeDir)) {
      copyFileSync(join(nativeDir, entry), join(destNative, entry));
    }
  }

  // Copy tray binary
  const trayBinDir = join(DIST_SEA_DIR, 'traybin');
  if (existsSync(trayBinDir)) {
    const destTray = join(stagingDir, 'traybin');
    mkdirSync(destTray, { recursive: true });
    for (const entry of readdirSync(trayBinDir)) {
      copyFileSync(join(trayBinDir, entry), join(destTray, entry));
    }
  }

  // Copy icon if present
  const icoPath = join(DIST_SEA_DIR, 'dgrid.ico');
  if (existsSync(icoPath)) {
    copyFileSync(icoPath, join(stagingDir, 'dgrid.ico'));
  }

  // Create zip using PowerShell (archives the DGrid folder so users extract DGrid/dgrid.exe)
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}' -DestinationPath '${zipPath}' -Force"`,
    { stdio: 'inherit' }
  );

  // Cleanup staging
  rmSync(join(DIST_SEA_DIR, 'zip-staging'), { recursive: true, force: true });

  const stats = statSync(zipPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
  console.log(`  Created: ${zipName} (${sizeMB} MB)`);
}

function cleanup(): void {
  console.log('Cleaning up...');
  // Remove intermediate files
  rmSync(SEA_BLOB, { force: true });
  rmSync(SEA_CONFIG, { force: true });
}

function printStats(): void {
  console.log(`\nSEA build complete!`);

  if (IS_MAC && existsSync(APP_BUNDLE)) {
    // Show .app bundle info
    const appSize = execSync(`du -sh "${APP_BUNDLE}"`, { encoding: 'utf-8' }).trim().split('\t')[0];
    console.log(`  App bundle: ${APP_BUNDLE} (${appSize})`);
    console.log(`\nRun with: open ${APP_BUNDLE}`);
  } else if (IS_WIN) {
    const version = getVersion();
    const zipName = `DGrid-${version}-win-x64.zip`;
    const zipPath = join(RELEASE_DIR, zipName);
    if (existsSync(zipPath)) {
      const stats = statSync(zipPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
      console.log(`  Zip: ${zipPath} (${sizeMB} MB)`);
    }
    console.log(`\nRun with: ${OUTPUT_BINARY}`);
  } else {
    const stats = statSync(OUTPUT_BINARY);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    console.log(`  Output: ${OUTPUT_BINARY}`);
    console.log(`  Size: ${sizeMB} MB`);
    console.log(`\nRun with: ${OUTPUT_BINARY}`);
  }
}

async function main(): Promise<void> {
  const platformLabel = IS_MAC ? 'macOS' : IS_WIN ? 'Windows' : 'Linux';
  console.log(`Building SEA for ${platformLabel}...\n`);

  // Ensure output directory exists
  if (!existsSync(DIST_SEA_DIR)) {
    mkdirSync(DIST_SEA_DIR, { recursive: true });
  }

  generateSeaConfig();
  createSeaBlob();
  createExecutable();
  signBinary();
  copyNativeModules();
  copyTrayBinary();
  copyAppIcon();
  createAppBundle();
  createDmg();
  createWindowsZip();
  cleanup();
  printStats();
}

main().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
