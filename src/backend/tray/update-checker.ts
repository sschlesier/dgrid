const RELEASES_URL = 'https://api.github.com/repos/sschlesier/dgrid/releases/latest';

export interface UpdateCheckResult {
  available: boolean;
  version?: string;
  url?: string;
}

function compareVersions(current: string, latest: string): boolean {
  const cur = current.replace(/^v/, '').split('.').map(Number);
  const lat = latest.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const c = cur[i] ?? 0;
    const l = lat[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateCheckResult> {
  try {
    const res = await fetch(RELEASES_URL, {
      headers: { 'User-Agent': 'DGrid-UpdateChecker' },
    });
    if (!res.ok) return { available: false };

    const data = (await res.json()) as { tag_name: string; html_url: string };
    const latestVersion = data.tag_name.replace(/^v/, '');

    if (compareVersions(currentVersion, latestVersion)) {
      return { available: true, version: latestVersion, url: data.html_url };
    }

    return { available: false };
  } catch {
    return { available: false };
  }
}
