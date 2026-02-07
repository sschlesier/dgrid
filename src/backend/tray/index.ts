import SysTrayModule from 'systray2';

// systray2 uses `export default` which becomes { default: fn } when bundled to CJS
const SysTray =
  (SysTrayModule as unknown as { default: typeof SysTrayModule }).default ?? SysTrayModule;
import { TRAY_ICON } from './icons.js';
import { openBrowser } from './browser.js';
import { checkForUpdate } from './update-checker.js';
import { exec } from 'child_process';

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Menu item seq_ids
const SEQ_OPEN = 0;
// seq_id 1 = separator
const SEQ_UPDATE = 2;
const SEQ_QUIT = 3;

export interface TrayContext {
  systray: InstanceType<typeof SysTray> | null;
  onQuit: () => Promise<void>;
  updateTimer: ReturnType<typeof setInterval> | null;
  updateUrl?: string;
}

/**
 * Initialize the system tray with menu items
 */
export function initTray(onQuit: () => Promise<void>): TrayContext {
  const context: TrayContext = {
    systray: null,
    onQuit,
    updateTimer: null,
  };

  const systray = new SysTray({
    menu: {
      icon: TRAY_ICON,
      isTemplateIcon: process.platform === 'darwin',
      title: '',
      tooltip: 'DGrid - MongoDB GUI',
      items: [
        {
          title: 'Open DGrid',
          tooltip: 'Open in browser',
          checked: false,
          enabled: true,
        },
        {
          title: '-', // Separator
          tooltip: '',
          checked: false,
          enabled: false,
        },
        {
          title: 'Update available',
          tooltip: 'Download the latest version',
          checked: false,
          enabled: true,
          hidden: true,
        },
        {
          title: 'Quit',
          tooltip: 'Stop server and quit',
          checked: false,
          enabled: true,
        },
      ],
    },
    debug: false,
    copyDir: true, // Copy binary to temp dir to avoid permission issues
  });

  systray.onClick((action) => {
    switch (action.seq_id) {
      case SEQ_OPEN:
        openBrowser();
        break;
      case SEQ_UPDATE:
        if (context.updateUrl) {
          exec(`open "${context.updateUrl}"`);
        }
        break;
      case SEQ_QUIT:
        handleQuit(context);
        break;
    }
  });

  context.systray = systray;

  // Start update checks
  const currentVersion = typeof DGRID_VERSION !== 'undefined' ? DGRID_VERSION : 'dev';
  if (currentVersion !== 'dev') {
    scheduleUpdateChecks(context, currentVersion);
  }

  return context;
}

async function runUpdateCheck(context: TrayContext, currentVersion: string): Promise<void> {
  const result = await checkForUpdate(currentVersion);
  if (result.available && result.version && context.systray) {
    context.updateUrl = result.url;
    context.systray.sendAction({
      type: 'update-item',
      seq_id: SEQ_UPDATE,
      item: {
        title: `Update available (v${result.version})`,
        tooltip: 'Click to download the latest version',
        checked: false,
        enabled: true,
        hidden: false,
      },
    });
  }
}

function scheduleUpdateChecks(context: TrayContext, currentVersion: string): void {
  // Check immediately
  runUpdateCheck(context, currentVersion);

  // Then every 6 hours
  context.updateTimer = setInterval(() => {
    runUpdateCheck(context, currentVersion);
  }, UPDATE_CHECK_INTERVAL_MS);
}

/**
 * Handle quit action
 */
async function handleQuit(context: TrayContext): Promise<void> {
  try {
    // Call the quit callback
    await context.onQuit();
  } catch (error) {
    console.error('Error during shutdown:', error);
  }

  // Kill the tray
  if (context.systray) {
    context.systray.kill(false);
  }
}

/**
 * Cleanup the tray
 */
export function cleanupTray(context: TrayContext): void {
  if (context.updateTimer) {
    clearInterval(context.updateTimer);
    context.updateTimer = null;
  }
  if (context.systray) {
    context.systray.kill(false);
    context.systray = null;
  }
}
