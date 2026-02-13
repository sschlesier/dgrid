import { extname, resolve, isAbsolute } from 'path';

export const ALLOWED_EXTENSIONS = ['.js', '.mongodb', '.json'];

const BLOCKED_PATTERNS = [
  '/etc/',
  '/var/log/',
  '/var/run/',
  '/var/lib/',
  '/usr/',
  '/bin/',
  '/sbin/',
  '/System/',
  '/Library/',
  'node_modules',
  '.git',
  '.env',
];

export function isPathSafe(filePath: string): boolean {
  // Must be absolute path
  if (!isAbsolute(filePath)) {
    return false;
  }

  // Prevent directory traversal
  const resolved = resolve(filePath);
  if (resolved !== filePath) {
    return false;
  }

  // Allow temp directories (for testing and temporary files)
  if (filePath.startsWith('/var/folders/') || filePath.startsWith('/tmp/')) {
    return true;
  }

  // Block sensitive paths
  for (const pattern of BLOCKED_PATTERNS) {
    if (filePath.includes(pattern)) {
      return false;
    }
  }

  return true;
}

export function isAllowedExtension(
  filePath: string,
  allowedExtensions: string[] = ALLOWED_EXTENSIONS
): boolean {
  const ext = extname(filePath).toLowerCase();
  return allowedExtensions.includes(ext);
}
