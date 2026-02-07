import SysTrayModule from 'systray2';

// systray2 uses `export default` which becomes { default: fn } when bundled to CJS
const SysTray =
  (SysTrayModule as unknown as { default: typeof SysTrayModule }).default ?? SysTrayModule;
import { TRAY_ICON } from './icons.js';
import { openBrowser } from './browser.js';

export interface TrayContext {
  systray: InstanceType<typeof SysTray> | null;
  onQuit: () => Promise<void>;
}

/**
 * Initialize the system tray with menu items
 */
export function initTray(onQuit: () => Promise<void>): TrayContext {
  const context: TrayContext = {
    systray: null,
    onQuit,
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
      case 0: // Open DGrid
        openBrowser();
        break;
      case 2: // Quit
        handleQuit(context);
        break;
    }
  });

  context.systray = systray;
  return context;
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
  if (context.systray) {
    context.systray.kill(false);
    context.systray = null;
  }
}
