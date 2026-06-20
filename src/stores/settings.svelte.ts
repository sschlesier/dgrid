// User-facing settings store — persisted to localStorage

const DEFAULT_QUERY_KEY = 'dgrid-default-query';

// The suffix that follows db.<collection> in new query tabs.
// This is also shown as the input placeholder when the user has not set a custom value.
export const DEFAULT_QUERY_SUFFIX = '.find({}).sort({ _id: -1 })';

function loadDefaultQuery(): string {
  try {
    return localStorage.getItem(DEFAULT_QUERY_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveDefaultQuery(value: string): void {
  try {
    localStorage.setItem(DEFAULT_QUERY_KEY, value);
  } catch {
    // Ignore storage errors
  }
}

class SettingsStore {
  // Raw value from storage — may be empty string when unset.
  defaultQuery = $state<string>(loadDefaultQuery());

  // Effective value used when opening a new tab. Falls back to the built-in
  // default when the user has left the field blank.
  get effectiveDefaultQuery(): string {
    return this.defaultQuery.trim() || DEFAULT_QUERY_SUFFIX;
  }

  setDefaultQuery(value: string): void {
    this.defaultQuery = value;
    saveDefaultQuery(value);
  }

  resetDefaultQuery(): void {
    this.setDefaultQuery('');
  }
}

// Singleton instance
export const settingsStore = new SettingsStore();
