import type { ServerInfoResponse, ServerInfoSection } from './contracts';

export interface ServerInfoRow {
  key: string;
  label: string;
  value: string;
}

const LABELS: Record<string, string> = {
  version: 'Version',
  gitVersion: 'Git version',
  modules: 'Modules',
  allocator: 'Allocator',
  javascriptEngine: 'JavaScript engine',
  bits: 'Bits',
  debug: 'Debug build',
  maxBsonObjectSize: 'Max BSON object size',
  storageEngines: 'Storage engines',
  openssl: 'OpenSSL',
  buildEnvironment: 'Build target',
  host: 'Host',
  process: 'Process',
  pid: 'PID',
  uptime: 'Uptime',
  localTime: 'Local time',
  storageEngine: 'Storage engine',
  connectionsCurrent: 'Connections (current)',
  connectionsAvailable: 'Connections (available)',
  setName: 'Replica set',
  isWritablePrimary: 'Writable primary',
  primary: 'Primary',
  hosts: 'Hosts',
  maxWireVersion: 'Max wire version',
  minWireVersion: 'Min wire version',
  maxMessageSizeBytes: 'Max message size (bytes)',
  maxWriteBatchSize: 'Max write batch size',
  logicalSessionTimeoutMinutes: 'Session timeout (minutes)',
};

export function formatUptime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function isTagged(value: unknown): value is { _type: string; _value: string } {
  return typeof value === 'object' && value !== null && '_type' in value && '_value' in value;
}

export function formatServerInfoValue(key: string, value: unknown): string {
  if (key === 'uptime') {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) return formatUptime(n);
  }
  if (isTagged(value)) return String(value._value);
  if (Array.isArray(value)) return value.map((v) => formatServerInfoValue('', v)).join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${formatServerInfoValue(k, v)}`)
      .join(', ');
  }
  return String(value);
}

export function sectionRows(section: ServerInfoSection): ServerInfoRow[] {
  return Object.entries(section.data ?? {})
    .filter(([key]) => key !== 'version')
    .map(([key, value]) => ({
      key,
      label: LABELS[key] ?? key,
      value: formatServerInfoValue(key, value),
    }));
}

export function serverVersion(info: ServerInfoResponse): string | undefined {
  const v = info.build.data?.version;
  return typeof v === 'string' ? v : undefined;
}

export function allSectionsFailed(info: ServerInfoResponse): boolean {
  return [info.build, info.runtime, info.topology].every((s) => s.error !== undefined);
}
