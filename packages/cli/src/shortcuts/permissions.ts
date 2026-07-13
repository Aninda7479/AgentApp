import { KeyInput } from '../types.js';

/** Allowed execution permission levels for tool invocations. */
export type PermissionLevel = 'ask' | 'auto' | 'deny';

/** Ordered list of permission levels for cycling. */
export const PERMISSION_LEVELS: PermissionLevel[] = ['ask', 'auto', 'deny'];

/** Cycles to the next permission level in the cycle (ask -> auto -> deny -> ask). */
export function cyclePermissionLevel(current: PermissionLevel): PermissionLevel {
  const index = PERMISSION_LEVELS.indexOf(current);
  if (index === -1) {
    return 'ask';
  }
  const nextIndex = (index + 1) % PERMISSION_LEVELS.length;
  return PERMISSION_LEVELS[nextIndex];
}

/** Returns a human-readable label for a permission level. */
export function getPermissionLabel(level: PermissionLevel): string {
  switch (level) {
    case 'ask':
      return 'Ask Before Execution';
    case 'auto':
      return 'Auto-Execute Tools';
    case 'deny':
      return 'Deny Tool Execution';
    default:
      return 'Unknown';
  }
}

/**
 * Handles Shift+Tab shortcut to cycle execution permission level.
 * @param key - Keyboard input event
 * @param currentLevel - Current permission level
 * @param onChangeLevel - Callback with the new permission level
 * @returns true if the shortcut was matched and handled
 */
export function handlePermissionCycleShortcut(
  key: KeyInput,
  currentLevel: PermissionLevel,
  onChangeLevel: (newLevel: PermissionLevel) => void
): boolean {
  if ((key.name === 'tab' || key.tab) && key.shift) {
    const nextLevel = cyclePermissionLevel(currentLevel);
    onChangeLevel(nextLevel);
    return true;
  }
  return false;
}
