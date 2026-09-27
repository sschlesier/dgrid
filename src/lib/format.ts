export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}

const TTL_UNITS = [
  { suffix: 'd', seconds: 86400 },
  { suffix: 'h', seconds: 3600 },
  { suffix: 'm', seconds: 60 },
];

export function formatTtl(seconds: number): string {
  if (!Number.isInteger(seconds) || seconds < 60) return `${seconds}s`;

  let i = TTL_UNITS.findIndex((unit) => seconds >= unit.seconds);
  let value = Math.round((seconds / TTL_UNITS[i].seconds) * 10) / 10;
  const larger = TTL_UNITS[i - 1];
  if (larger && value * TTL_UNITS[i].seconds >= larger.seconds) {
    i -= 1;
    value = Math.round((seconds / larger.seconds) * 10) / 10;
  }
  return `${value}${TTL_UNITS[i].suffix} (${seconds}s)`;
}
