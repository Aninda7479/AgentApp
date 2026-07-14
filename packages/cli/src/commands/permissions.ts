import { CLICommandResult } from '../types.js';
import { PermissionLevel, getPermissionLabel } from '../shortcuts/permissions.js';

/** Handles `/permissions` command: views or sets permission levels. */
export function handlePermissionsCommand(
  args: string[],
  currentLevel: PermissionLevel,
  setPermission: (level: PermissionLevel) => void
): CLICommandResult {
  if (args.length === 0) {
    return {
      success: true,
      message: `Current Permission Level: ${getPermissionLabel(currentLevel)} (${currentLevel})`
    };
  }

  const sub = args[0].toLowerCase();
  if (sub === 'set') {
    const level = args[1]?.toLowerCase();
    if (level === 'ask' || level === 'auto' || level === 'deny') {
      setPermission(level as PermissionLevel);
      return {
        success: true,
        message: `Permission level updated to: ${getPermissionLabel(level as PermissionLevel)} (${level})`,
        data: { permission: level }
      };
    }
    return {
      success: false,
      message: `Invalid permission level. Choose from: ask, auto, deny`
    };
  }

  // Direct set check e.g. `/permissions auto`
  if (sub === 'ask' || sub === 'auto' || sub === 'deny') {
    setPermission(sub as PermissionLevel);
    return {
      success: true,
      message: `Permission level updated to: ${getPermissionLabel(sub as PermissionLevel)} (${sub})`,
      data: { permission: sub }
    };
  }

  return {
    success: false,
    message: `Usage: /permissions [set] [ask | auto | deny]`
  };
}
