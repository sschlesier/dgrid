// Keybindings store — configurable keyboard shortcuts with localStorage persistence

import { formatShortcut } from '../utils/keyboard';

export interface ShortcutBinding {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface ShortcutDefinition {
  id: string;
  description: string;
  category: string;
  defaultBinding: ShortcutBinding;
  alwaysGlobal?: boolean;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  // General
  {
    id: 'show-help',
    description: 'Show keyboard shortcuts',
    category: 'General',
    defaultBinding: { key: '?' },
  },
  {
    id: 'edit-field',
    description: 'Edit field value',
    category: 'General',
    defaultBinding: { key: 'e', meta: true },
  },

  // Tabs
  {
    id: 'new-tab',
    description: 'New tab',
    category: 'Tabs',
    defaultBinding: { key: 't', alt: true },
    alwaysGlobal: true,
  },
  {
    id: 'close-tab',
    description: 'Close tab',
    category: 'Tabs',
    defaultBinding: { key: 'w', alt: true },
    alwaysGlobal: true,
  },

  // Query
  {
    id: 'execute-all',
    description: 'Execute all queries',
    category: 'Query',
    defaultBinding: { key: 'enter', meta: true },
  },
  {
    id: 'execute-current',
    description: 'Execute current query',
    category: 'Query',
    defaultBinding: { key: 'enter', meta: true, shift: true },
  },
  {
    id: 'execute-selected',
    description: 'Execute selected text',
    category: 'Query',
    defaultBinding: { key: 'enter', meta: true, alt: true },
  },

  // File
  {
    id: 'save-query',
    description: 'Save query to file',
    category: 'File',
    defaultBinding: { key: 's', meta: true },
  },
  {
    id: 'save-query-as',
    description: 'Save As',
    category: 'File',
    defaultBinding: { key: 's', meta: true, shift: true },
  },
  {
    id: 'open-file',
    description: 'Open file',
    category: 'File',
    defaultBinding: { key: 'o', meta: true },
  },
];

const STORAGE_KEY = 'dgrid-keybindings';

function loadOverrides(): Record<string, ShortcutBinding> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

function saveOverrides(overrides: Record<string, ShortcutBinding>): void {
  try {
    if (Object.keys(overrides).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    }
  } catch {
    // Ignore storage errors
  }
}

function bindingsEqual(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    !!a.meta === !!b.meta &&
    !!a.ctrl === !!b.ctrl &&
    !!a.shift === !!b.shift &&
    !!a.alt === !!b.alt
  );
}

class KeybindingsStore {
  overrides = $state<Record<string, ShortcutBinding>>(loadOverrides());

  /** All shortcut definitions (read-only). */
  get definitions(): ShortcutDefinition[] {
    return SHORTCUT_DEFINITIONS;
  }

  /** Get the active binding for a shortcut (override or default). */
  getBinding(id: string): ShortcutBinding {
    if (this.overrides[id]) {
      return this.overrides[id];
    }
    const def = SHORTCUT_DEFINITIONS.find((d) => d.id === id);
    if (!def) throw new Error(`Unknown shortcut id: ${id}`);
    return def.defaultBinding;
  }

  /** Get the formatted display string for a shortcut. */
  getFormatted(id: string): string {
    return formatShortcut(this.getBinding(id));
  }

  /** Check if a shortcut has been customized. */
  isCustomized(id: string): boolean {
    return id in this.overrides;
  }

  /** Set a custom binding for a shortcut. */
  setBinding(id: string, binding: ShortcutBinding): void {
    // If binding matches the default, remove the override
    const def = SHORTCUT_DEFINITIONS.find((d) => d.id === id);
    if (def && bindingsEqual(binding, def.defaultBinding)) {
      this.resetBinding(id);
      return;
    }
    this.overrides = { ...this.overrides, [id]: binding };
    saveOverrides(this.overrides);
  }

  /** Reset a single shortcut to its default. */
  resetBinding(id: string): void {
    if (!(id in this.overrides)) return;
    const rest = { ...this.overrides };
    delete rest[id];
    this.overrides = rest;
    saveOverrides(this.overrides);
  }

  /** Reset all shortcuts to defaults. */
  resetAll(): void {
    this.overrides = {};
    saveOverrides(this.overrides);
  }

  /** Find a conflicting shortcut. Returns the conflicting id or null. */
  findConflict(excludeId: string, binding: ShortcutBinding): string | null {
    for (const def of SHORTCUT_DEFINITIONS) {
      if (def.id === excludeId) continue;
      const current = this.getBinding(def.id);
      if (bindingsEqual(current, binding)) {
        return def.id;
      }
    }
    return null;
  }
}

// Singleton instance
export const keybindingsStore = new KeybindingsStore();
