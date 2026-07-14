import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { loadSettings, updateSettings, AppSettings } from '@superagent/core';

/** Top-level settings keys accepted by `/config set`. */
const WRITABLE_KEYS: (keyof AppSettings)[] = [
  'theme',
  'providers',
  'models',
  'lastUsedModel',
  'general',
  'modelGov',
  'internetAccess'
];

/** Reads a (possibly dotted) path out of a settings object. */
function readPath(obj: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Coerces a raw string argument into a typed value (bool/number/json/string). */
function coerce(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    try {
      return JSON.parse(value);
    } catch {
      /* fall through to string */
    }
  }
  return value;
}

/** Builds a nested object from a dotted key and a value (e.g. theme.cli, dark). */
function buildPath(dotted: string, value: unknown): Record<string, unknown> {
  const parts = dotted.split('.');
  let node: Record<string, unknown> = {};
  let cursor = node;
  for (let i = 0; i < parts.length - 1; i++) {
    cursor[parts[i]] = {};
    cursor = cursor[parts[i]] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
  return node;
}

/** Handles `/config`: view or modify persisted application settings. */
export function handleConfigCommand(args: string[]): CLIConfigResult {
  const [sub, ...rest] = args;

  if (!sub || sub === 'view' || sub === 'list') {
    const settings = loadSettings();
    return {
      success: true,
      message: '=== SuperAgent Configuration ===\n' + JSON.stringify(settings, null, 2),
      data: settings
    };
  }

  if (sub === 'get') {
    const key = rest[0];
    if (!key) {
      return { success: false, message: 'Usage: /config get <key>', error: 'Missing key' };
    }
    const value = readPath(loadSettings(), key);
    if (value === undefined) {
      return { success: false, message: `No setting at "${key}"`, error: 'Not found' };
    }
    return {
      success: true,
      message: `${key} = ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`,
      data: value
    };
  }

  if (sub === 'set') {
    const key = rest[0];
    const raw = rest.slice(1).join(' ');
    if (!key || raw === '') {
      return { success: false, message: 'Usage: /config set <key> <value>', error: 'Missing key or value' };
    }
    const top = key.split('.')[0] as keyof AppSettings;
    if (!WRITABLE_KEYS.includes(top)) {
      return { success: false, message: `Cannot set "${top}". Allowed: ${WRITABLE_KEYS.join(', ')}`, error: 'Forbidden key' };
    }
    const value = coerce(raw);
    // Build only the sub-path after the top-level key to avoid wrong nesting.
    // e.g. key='theme.cli' -> subPath='cli' -> patchValue={ cli: value }
    const dotIndex = key.indexOf('.');
    const patchValue = dotIndex >= 0 ? buildPath(key.slice(dotIndex + 1), value) : value;
    updateSettings(top, patchValue as AppSettings[typeof top]);
    return { success: true, message: `Set ${key} = ${typeof value === 'object' ? JSON.stringify(value) : String(value)}` };
  }

  if (sub === 'reset') {
    const key = rest[0];
    if (!key) return { success: false, message: 'Usage: /config reset <key>', error: 'Missing key' };
    const top = key.split('.')[0] as keyof AppSettings;
    if (!WRITABLE_KEYS.includes(top)) {
      return { success: false, message: `Cannot reset "${top}".`, error: 'Forbidden key' };
    }
    updateSettings(top, null as unknown as AppSettings[typeof top]);
    return { success: true, message: `Reset ${key} to default.` };
  }

  return {
    success: false,
    message: 'Usage: /config [view | get <key> | set <key> <value> | reset <key>]',
    error: `Unknown config subcommand: ${sub}`
  };
}

/** Result envelope for the /config command. */
export interface CLIConfigResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
}

/** Registers the `/config` slash command: view or modify configuration. */
export function registerConfigCommand(router: SlashCommandRouter): void {
  router.register(
    'config',
    (ctx: SlashCommandContext): SlashCommandResult => {
      const res = handleConfigCommand(ctx.args);
      return { success: res.success, command: ctx.command, output: res.message, error: res.error, data: res.data };
    },
    {
      description: 'View or modify configuration options',
      aliases: ['cfg', 'settings'],
      usage: '/config [view | get <key> | set <key> <value> | reset <key>]'
    }
  );
}
