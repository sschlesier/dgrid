import { exec } from 'child_process';

const HOST = '127.0.0.1';
const PORT = 3001;

/**
 * Open a URL in the default browser using a platform-appropriate command
 */
export function openUrl(url: string): void {
  // macOS: use 'open' command
  if (process.platform === 'darwin') {
    exec(`open "${url}"`, (error) => {
      if (error) {
        console.error('Failed to open URL:', error);
      }
    });
    return;
  }

  // Linux: use xdg-open
  if (process.platform === 'linux') {
    exec(`xdg-open "${url}"`, (error) => {
      if (error) {
        console.error('Failed to open URL:', error);
      }
    });
    return;
  }

  // Windows: use start
  if (process.platform === 'win32') {
    exec(`start "" "${url}"`, (error) => {
      if (error) {
        console.error('Failed to open URL:', error);
      }
    });
    return;
  }

  console.error(`Unsupported platform: ${process.platform}`);
}

/**
 * Open the DGrid URL in the default browser
 */
export function openBrowser(): void {
  openUrl(`http://${HOST}:${PORT}`);
}
