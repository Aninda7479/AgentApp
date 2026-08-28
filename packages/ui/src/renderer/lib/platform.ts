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
