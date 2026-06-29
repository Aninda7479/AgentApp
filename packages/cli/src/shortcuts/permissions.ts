import { KeyInput } from '../types.js';

export type PermissionLevel = 'ask' | 'auto' | 'deny';

export const PERMISSION_LEVELS: PermissionLevel[] = ['ask', 'auto', 'deny'];

export function cyclePermissionLevel(current: PermissionLevel): PermissionLevel {
  const index = PERMISSION_LEVELS.indexOf(current);
  if (index === -1) {
    return 'ask';
  }
  const nextIndex = (index + 1) % PERMISSION_LEVELS.length;
  return PERMISSION_LEVELS[nextIndex];
}

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
