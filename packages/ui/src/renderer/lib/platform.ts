/**
 * Platform detection and dynamic OS shortcut formatting utility.
 * Adapts UI typography, key badges, and modifier symbols dynamically
 * based on whether the client is running on macOS, Windows, or Linux.
 */

export type PlatformType = 'macos' | 'windows' | 'linux';

/** Detect host operating system. */
export function getPlatform(): PlatformType {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'windows';
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const platform = (navigator as any).userAgentData?.platform?.toLowerCase() || navigator.platform?.toLowerCase() || '';

  if (platform.includes('mac') || userAgent.includes('macintosh') || userAgent.includes('mac os')) {
    return 'macos';
  }
  if (platform.includes('win') || userAgent.includes('windows')) {
    return 'windows';
  }
  if (platform.includes('linux') || userAgent.includes('linux')) {
    return 'linux';
  }

  return 'windows';
}

export const isMacOS = (): boolean => getPlatform() === 'macos';
export const isWindows = (): boolean => getPlatform() === 'windows';
export const isLinux = (): boolean => getPlatform() === 'linux';

/** Detect whether the app is running in the native desktop app shell (Tauri). */
export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
}

/** Detect whether the app is running in standard web browser mode. */
export function isWeb(): boolean {
  return !isDesktop();
}

export interface KeySymbols {
  meta: string;
  metaName: string;
  alt: string;
  altName: string;
  shift: string;
  shiftName: string;
  ctrl: string;
  ctrlName: string;
  enter: string;
  escape: string;
  space: string;
}

export function getKeySymbols(): KeySymbols {
  const isMac = isMacOS();
  if (isMac) {
    return {
      meta: '⌘',
      metaName: 'Cmd',
      alt: '⌥',
      altName: 'Option',
      shift: '⇧',
      shiftName: 'Shift',
      ctrl: '⌃',
      ctrlName: 'Control',
      enter: '↵',
      escape: 'Esc',
      space: 'Space',
    };
  }

  return {
    meta: 'Win',
    metaName: 'Win',
    alt: 'Alt',
    altName: 'Alt',
    shift: 'Shift',
    shiftName: 'Shift',
    ctrl: 'Ctrl',
    ctrlName: 'Ctrl',
    enter: 'Enter',
    escape: 'Esc',
    space: 'Space',
  };
}

/**
 * Converts an electron/tauri accelerator string (e.g. 'CommandOrControl+Shift+S')
 * into human-readable, OS-appropriate text or glyphs.
 *
 * Examples:
 *   - 'CommandOrControl+Shift+S':
 *       macOS: '⌘ ⇧ S'
 *       Windows: 'Ctrl + Shift + S'
 *   - 'CommandOrControl+Alt+Space':
 *       macOS: '⌘ ⌥ Space'
 *       Windows: 'Ctrl + Alt + Space'
 */
export function formatShortcut(shortcut: string, options: { compact?: boolean } = {}): string {
  if (!shortcut) return '';
  const isMac = isMacOS();
  const sep = options.compact ? (isMac ? '' : '+') : ' + ';

  const parts = shortcut.split('+').map((p) => p.trim());
  const mapped = parts.map((part) => {
    const lower = part.toLowerCase();
    if (lower === 'commandorcontrol' || lower === 'cmdorctrl' || lower === 'cmd' || lower === 'command' || lower === 'ctrl' || lower === 'control') {
      return isMac ? '⌘' : 'Ctrl';
    }
    if (lower === 'alt' || lower === 'option') {
      return isMac ? '⌥' : 'Alt';
    }
    if (lower === 'shift') {
      return isMac ? '⇧' : 'Shift';
    }
    if (lower === 'enter' || lower === 'return') {
      return isMac ? '↵' : 'Enter';
    }
    if (lower === 'space') {
      return 'Space';
    }
    if (lower === 'escape' || lower === 'esc') {
      return 'Esc';
    }
    return part.toUpperCase();
  });

  return mapped.join(sep);
}


/**
 * Normalizes any human-entered shortcut (e.g. 'Ctrl + Shift + S', '⌘ + ⇧ + S', 'cmd+shift+s')
 * into the standard cross-platform accelerator string (e.g. 'CommandOrControl+Shift+S').
 */
export function toAccelerator(input: string): string {
  if (!input || !input.trim()) return 'CommandOrControl+Shift+S';
  const parts = input.replace(/[\+_\-\s]+/g, '+').split('+').map((p) => p.trim()).filter(Boolean);
  const normalized = parts.map((p) => {
    const l = p.toLowerCase();
    if (l === 'ctrl' || l === 'control' || l === 'cmd' || l === 'command' || l === 'commandorcontrol' || l === 'cmdorctrl' || l === '⌘' || l === '⌃' || l === 'win') {
      return 'CommandOrControl';
    }
    if (l === 'alt' || l === 'option' || l === 'opt' || l === '⌥') {
      return 'Alt';
    }
    if (l === 'shift' || l === '⇧') {
      return 'Shift';
    }
    if (l === 'space') {
      return 'Space';
    }
    if (l === 'enter' || l === 'return' || l === '↵') {
      return 'Enter';
    }
    if (l === 'esc' || l === 'escape') {
      return 'Escape';
    }
    return p.toUpperCase();
  });
  return normalized.join('+');
}

/**
 * Returns the OS-appropriate display format for an accelerator.
 * E.g., 'CommandOrControl+Shift+S' -> 'Ctrl + Shift + S' on Windows/Linux, '⌘ + Shift + S' on macOS.
 */
export function toDisplayShortcut(shortcut: string): string {
  return formatShortcut(shortcut);
}

/**
 * Checks whether the platform primary modifier key is active (Cmd on macOS, Ctrl on Windows/Linux).
 */
export function hasPrimaryModifier(e: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return isMacOS() ? e.metaKey : e.ctrlKey;
}

/**
 * Checks whether a keyboard event corresponds to an Undo action (Cmd+Z on macOS, Ctrl+Z on Windows/Linux).
 */
export function isUndoShortcut(e: { ctrlKey: boolean; metaKey: boolean; shiftKey?: boolean; key?: string }): boolean {
  const key = e.key?.toLowerCase();
  const hasMod = isMacOS() ? e.metaKey : (e.ctrlKey || e.metaKey);
  return hasMod && key === 'z' && !e.shiftKey;
}

/**
 * Checks whether a keyboard event corresponds to a Redo action:
 * - macOS: Cmd+Shift+Z
 * - Windows/Linux: Ctrl+Y or Ctrl+Shift+Z
 */
export function isRedoShortcut(e: { ctrlKey: boolean; metaKey: boolean; shiftKey?: boolean; key?: string }): boolean {
  const key = e.key?.toLowerCase();
  const hasMod = isMacOS() ? e.metaKey : (e.ctrlKey || e.metaKey);

  if (hasMod && key === 'z' && e.shiftKey) {
    return true;
  }
  if (!isMacOS() && hasMod && key === 'y') {
    return true;
  }
  return false;
}


