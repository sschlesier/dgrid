// Editor preferences store - Vim mode and recent file paths

const VIM_MODE_KEY = 'dgrid-editor-vim-mode';
const RECENT_PATHS_KEY = 'dgrid-editor-recent-paths';
const MAX_RECENT_PATHS = 10;

function loadVimMode(): boolean {
  try {
    const stored = localStorage.getItem(VIM_MODE_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
}

function saveVimMode(enabled: boolean): void {
  try {
    localStorage.setItem(VIM_MODE_KEY, String(enabled));
  } catch {
    // Ignore storage errors
  }
}

function loadRecentPaths(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_PATHS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveRecentPaths(paths: string[]): void {
  try {
    localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(paths));
  } catch {
    // Ignore storage errors
  }
}

class EditorPreferencesStore {
  vimMode = $state<boolean>(loadVimMode());
  recentPaths = $state<string[]>(loadRecentPaths());

  toggleVimMode(): void {
    this.vimMode = !this.vimMode;
    saveVimMode(this.vimMode);
  }

  setVimMode(enabled: boolean): void {
    this.vimMode = enabled;
    saveVimMode(this.vimMode);
  }

  addRecentPath(path: string): void {
    // Remove if already exists
    const filtered = this.recentPaths.filter((p) => p !== path);
    // Add to front
    this.recentPaths = [path, ...filtered].slice(0, MAX_RECENT_PATHS);
    saveRecentPaths(this.recentPaths);
  }

  removeRecentPath(path: string): void {
    this.recentPaths = this.recentPaths.filter((p) => p !== path);
    saveRecentPaths(this.recentPaths);
  }

  clearRecentPaths(): void {
    this.recentPaths = [];
    saveRecentPaths(this.recentPaths);
  }
}

// Singleton instance
export const editorStore = new EditorPreferencesStore();
