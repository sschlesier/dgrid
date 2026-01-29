import { exec } from 'child_process';

const HOST = '127.0.0.1';
const PORT = 3001;

/**
 * Open the DGrid URL in the default browser
 */
export function openBrowser(): void {
  const url = `http://${HOST}:${PORT}`;

  // macOS: use 'open' command
  if (process.platform === 'darwin') {
    exec(`open "${url}"`, (error) => {
      if (error) {
        console.error('Failed to open browser:', error);
      }
    });
    return;
  }

  // Linux: use xdg-open
  if (process.platform === 'linux') {
    exec(`xdg-open "${url}"`, (error) => {
      if (error) {
        console.error('Failed to open browser:', error);
      }
    });
    return;
  }

  // Windows: use start
  if (process.platform === 'win32') {
    exec(`start "" "${url}"`, (error) => {
      if (error) {
        console.error('Failed to open browser:', error);
      }
    });
    return;
  }

  console.error(`Unsupported platform: ${process.platform}`);
}
