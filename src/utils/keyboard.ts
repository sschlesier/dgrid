// Keyboard shortcut utilities

import type { ShortcutBinding } from '../stores/keybindings.svelte';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  alwaysGlobal?: boolean;
  handler: (event: KeyboardEvent) => void;
}

type ShortcutId = string;

const shortcuts = new Map<ShortcutId, KeyboardShortcut>();
let isListenerRegistered = false;

/**
 * Detect if running on macOS
 */
export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

/**
 * Check if the modifier key matches the event
 * On Mac: uses Meta (Cmd), on Windows/Linux: uses Ctrl
 */
export function matchesModifier(
  event: KeyboardEvent,
  shortcut: Pick<KeyboardShortcut, 'meta' | 'ctrl' | 'shift' | 'alt'>
): boolean {
  const mac = isMac();

  // Check primary modifier (Cmd on Mac, Ctrl on Windows/Linux)
  const wantsPrimaryMod = shortcut.meta || shortcut.ctrl;
  const hasPrimaryMod = mac ? event.metaKey : event.ctrlKey;

  if (wantsPrimaryMod && !hasPrimaryMod) return false;
  if (!wantsPrimaryMod && hasPrimaryMod) return false;

  // Check shift modifier
  // When a primary modifier (ctrl/meta) is declared, enforce strict shift matching.
  // When no primary modifier, allow shiftKey to pass through (e.g. "?" is Shift+/).
  if (shortcut.shift && !event.shiftKey) return false;
  if (!shortcut.shift && event.shiftKey && wantsPrimaryMod) return false;

  // Check alt modifier
  if (shortcut.alt && !event.altKey) return false;
  if (!shortcut.alt && event.altKey) return false;

  return true;
}

/**
 * Check if an event matches a shortcut
 */
export function matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) {
    return false;
  }
  return matchesModifier(event, shortcut);
}

/**
 * Check if an event matches a binding (no handler required)
 */
export function matchesBinding(event: KeyboardEvent, binding: ShortcutBinding): boolean {
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) {
    return false;
  }
  return matchesModifier(event, binding);
}

/**
 * Convert a ShortcutBinding to a CodeMirror key string (e.g. 'Mod-Enter', 'Mod-Shift-Enter')
 */
export function bindingToCodeMirrorKey(binding: ShortcutBinding): string {
  const parts: string[] = [];
  if (binding.meta || binding.ctrl) parts.push('Mod');
  if (binding.shift) parts.push('Shift');
  if (binding.alt) parts.push('Alt');

  // CodeMirror uses capitalized key names
  const keyMap: Record<string, string> = {
    enter: 'Enter',
    escape: 'Escape',
    backspace: 'Backspace',
    delete: 'Delete',
    tab: 'Tab',
    arrowup: 'ArrowUp',
    arrowdown: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    arrowright: 'ArrowRight',
  };

  const cmKey = keyMap[binding.key.toLowerCase()] || binding.key.toLowerCase();
  parts.push(cmKey);

  return parts.join('-');
}

/**
 * Create a KeyboardShortcut from a ShortcutBinding plus a handler
 */
export function bindingToShortcut(
  binding: ShortcutBinding,
  handler: (event: KeyboardEvent) => void,
  options?: { alwaysGlobal?: boolean }
): KeyboardShortcut {
  return {
    key: binding.key,
    meta: binding.meta,
    ctrl: binding.ctrl,
    shift: binding.shift,
    alt: binding.alt,
    alwaysGlobal: options?.alwaysGlobal,
    handler,
  };
}

/**
 * Handle keyboard events and dispatch to registered shortcuts
 */
function handleKeyDown(event: KeyboardEvent): void {
  // Skip if focus is on an input element (unless it's a global shortcut)
  const target = event.target as HTMLElement;
  const isInput =
    target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

  for (const shortcut of shortcuts.values()) {
    if (matchesShortcut(event, shortcut)) {
      if (!isInput || shortcut.alwaysGlobal) {
        event.preventDefault();
        shortcut.handler(event);
        return;
      }
    }
  }
}

/**
 * Ensure the global keyboard listener is registered
 */
function ensureListener(): void {
  if (!isListenerRegistered && typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown);
    isListenerRegistered = true;
  }
}

/**
 * Register a keyboard shortcut
 */
export function registerShortcut(id: ShortcutId, shortcut: KeyboardShortcut): void {
  ensureListener();
  shortcuts.set(id, shortcut);
}

/**
 * Unregister a keyboard shortcut
 */
export function unregisterShortcut(id: ShortcutId): void {
  shortcuts.delete(id);
}

/**
 * Unregister all keyboard shortcuts
 */
export function unregisterAllShortcuts(): void {
  shortcuts.clear();
}

/**
 * Format a shortcut for display
 */
export function formatShortcut(
  shortcut: Pick<KeyboardShortcut, 'key' | 'ctrl' | 'meta' | 'shift' | 'alt'>
): string {
  const mac = isMac();
  const parts: string[] = [];

  if (shortcut.ctrl || shortcut.meta) {
    parts.push(mac ? '⌘' : 'Ctrl');
  }
  if (shortcut.shift) {
    parts.push(mac ? '⇧' : 'Shift');
  }
  if (shortcut.alt) {
    parts.push(mac ? '⌥' : 'Alt');
  }

  // Format the key
  const keyMap: Record<string, string> = {
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    enter: '↵',
    escape: 'Esc',
    backspace: '⌫',
    delete: 'Del',
    tab: 'Tab',
  };

  const displayKey = keyMap[shortcut.key.toLowerCase()] || shortcut.key.toUpperCase();
  parts.push(displayKey);

  return mac ? parts.join('') : parts.join('+');
}

/**
 * Cleanup function - remove global listener
 */
export function cleanup(): void {
  if (isListenerRegistered && typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeyDown);
    isListenerRegistered = false;
  }
  shortcuts.clear();
}
