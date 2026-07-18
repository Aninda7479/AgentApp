import * as fs from 'fs';
import * as path from 'path';
import { getUserDataDirectory, getConfigDirectory, STORAGE_DIRS } from './locations.js';

/** Theme preference settings for desktop and CLI surfaces. */
export interface ThemeSettings {
  desktop?: 'light' | 'dark' | 'system';
  cli?: 'light' | 'dark' | 'system' | string;
}

/** Configuration for a single AI provider (API key, base URL, etc.). */
export interface ProviderSettings {
  id: string;
  name: string;
  type: 'env' | 'key' | 'custom';
  apiKey: string;
  baseUrl: string;
}

/** Per-model pricing info (cost per million tokens). */
export interface ModelPricing {
  inputPer1M?: string;
  outputPer1M?: string;
  cachedInputPer1M?: string;
}

/** Configuration and metadata for a registered model. */
export interface ModelSettings {
  id: string;
  name: string;
  providerId: string;
  enabled: boolean;
  description?: string;
  contextLimit?: string;
  outputLimit?: string;
  inputModalities?: string[];
  outputModalities?: string[];
  pricing?: ModelPricing;
  caching?: boolean;
  type?: string;
}

/** Tracks the most recently used provider and model. */
export interface LastUsedModelSettings {
  provider?: string;
  model?: string;
}

/**
 * Internet access governance level. Controls whether the agent may reach the
 * network on its own (web fetch, browser navigation, web search, remote MCP).
 *
 * - `all`        — unrestricted network access (default).
 * - `observation`— read-only network access only (GET/HEAD). Mutating requests
 *                  (POST/PUT/DELETE, form submissions, uploads) are blocked.
 * - `none`       — the agent is fully air-gapped: all agent-initiated network
 *                  access is blocked. The AI provider API itself is always
 *                  allowed so the assistant can still answer.
 */
export type InternetAccessLevel = 'all' | 'observation' | 'none';

/** Internet access governance settings. */
export interface InternetAccessSettings {
  level?: InternetAccessLevel;
}

/** General application-level preferences. */
export interface GeneralAppSettings {
  workMode?: 'coding' | 'everyday';
  confirmShellCommands?: boolean;
  autoReviewPlan?: boolean;
  unsandboxedActions?: boolean;
}

/** Model governance: enabled models, routing strategy, and optimization goal. */
export interface ModelGovSettings {
  enabledModels?: string[];
  autoUpdateInstructions?: boolean;
  optimizationGoal?: 'quality' | 'cost' | 'balanced';
  routingStrategy?: 'orchestrator' | 'router';
  /** Default reasoning effort applied to Orchestrator-routed turns. 'off' means
   *  leave the per-turn/cascade logic untouched (caller preference still wins). */
  reasoningEffort?: 'off' | 'low' | 'medium' | 'high';
  categoryOverrides?: Record<string, string>;
}

/** Settings for the built-in browser automation engine. */
export interface BrowserUseSettings {
  headless?: boolean;
  width?: number;
  height?: number;
  userAgent?: string;
  timeout?: number;
  connectToActiveChrome?: boolean;
  chromeDebugPort?: number;
  useUserProfile?: boolean;
  userProfilePath?: string;
}

/** Settings for desktop computer-use automation (mouse/keyboard). */
export interface ComputerUseSettings {
  enableMouse?: boolean;
  enableKeyboard?: boolean;
  actionDelay?: number;
}

/**
 * 3D model / character generation capability (Tripo3D / Meshy-style
 * text- or image-to-3D). This is a **power-user** feature, so it is
 * DISABLED BY DEFAULT and the user must opt in from Settings.
 *
 * - `enabled` — master switch for the whole capability (default false).
 * - `provider` — which backend to call ('tripo' | 'meshy').
 * - `apiKey` — that provider's API key (kept only in local settings,
 *   sent nowhere except the provider's API).
 * - `mode` — where the entry point lives: `chat` exposes a
 *   `make_3d_character` agent tool used inline in the main agent chat;
 *   `studio` routes to a dedicated "3D Studio" page instead.
 */
export interface ThreeDSettings {
  enabled?: boolean;
  provider?: 'tripo' | 'meshy';
  apiKey?: string;
  mode?: 'chat' | 'studio';
}

/** Map of built-in plugin id → whether the user has enabled it. */
export type PluginsSettings = Record<string, boolean>;

/**
 * Configuration for the self-hosted **Web App** (the web server that the
 * Desktop app can start from Settings → Web App, and which the CLI can start
 * with `superagent --start-web`). The server itself lives in `@superagent/web`;
 * these fields only persist the user's preferred port / auto-start toggle.
 */
export interface WebAppSettings {
  /** TCP port the hosted web server binds to (default 3000). */
  port?: number;
  /** When true, the Desktop app launches the web server on startup. */
  autoStart?: boolean;
}

/** Top-level application settings object persisted to disk. */
export interface AppSettings {
  theme?: ThemeSettings;
  providers?: ProviderSettings[];
  models?: ModelSettings[];
  lastUsedModel?: LastUsedModelSettings;
  general?: GeneralAppSettings;
  modelGov?: ModelGovSettings;
  browserUse?: BrowserUseSettings;
  computerUse?: ComputerUseSettings;
  internetAccess?: InternetAccessSettings;
  plugins?: PluginsSettings;
  threeD?: ThreeDSettings;
  webApp?: WebAppSettings;
}

/** Resolved file system paths for user data and config files. */
export interface SettingsPaths {
  userDataDirectory: string;
  configDirectory: string;
  settingsFilePath: string;
  backupFilePath: string;
}

/** Resolves all relevant file paths from a base directory. */
export function getSettingsPaths(baseDirectory = getUserDataDirectory()): SettingsPaths {
  const configDirectory = path.join(baseDirectory, STORAGE_DIRS.config);
  const settingsFilePath = path.join(configDirectory, 'settings.json');
  return {
    userDataDirectory: baseDirectory,
    configDirectory,
    settingsFilePath,
    backupFilePath: `${settingsFilePath}.bak`
  };
}

/** Returns the path to the main settings JSON file. */
export function getSettingsFilePath(): string {
  return getSettingsPaths().settingsFilePath;
}

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as T;
}

/** Reads, writes, and caches the application settings from disk. */
export class SettingsStorage {
  private static cachedSettings: AppSettings | null = null;

  /** Loads settings from disk (primary file, with backup fallback). */
  public static loadSettings(): AppSettings {
    const { settingsFilePath, backupFilePath } = getSettingsPaths();

    try {
      const primary = readJsonFile<AppSettings>(settingsFilePath);
      if (primary) {
        this.cachedSettings = primary;
        return primary;
      }
    } catch (e) {
      console.error('Failed to parse settings.json, trying backup...', e);
    }

    try {
      const backup = readJsonFile<AppSettings>(backupFilePath);
      if (backup) {
        this.cachedSettings = backup;
        return backup;
      }
    } catch (e) {
      console.error('Failed to parse backup settings.json.bak:', e);
    }

    return this.cachedSettings || {};
  }

  /** Persists settings to disk atomically with a backup file. */
  public static saveSettings(settings: AppSettings): void {
    try {
      const { configDirectory, settingsFilePath, backupFilePath } = getSettingsPaths();
      fs.mkdirSync(configDirectory, { recursive: true });

      const current = this.loadSettings();
      const updated: AppSettings = {
        theme: settings.theme !== undefined ? (settings.theme === null ? undefined : { ...current.theme, ...settings.theme }) : current.theme,
        providers: settings.providers !== undefined ? (settings.providers === null ? undefined : settings.providers) : current.providers,
        models: settings.models !== undefined ? (settings.models === null ? undefined : settings.models) : current.models,
        lastUsedModel: settings.lastUsedModel !== undefined ? (settings.lastUsedModel === null ? undefined : { ...current.lastUsedModel, ...settings.lastUsedModel }) : current.lastUsedModel,
        general: settings.general !== undefined ? (settings.general === null ? undefined : { ...current.general, ...settings.general }) : current.general,
        modelGov: settings.modelGov !== undefined ? (settings.modelGov === null ? undefined : { ...current.modelGov, ...settings.modelGov }) : current.modelGov,
        internetAccess: settings.internetAccess !== undefined ? (settings.internetAccess === null ? undefined : { ...current.internetAccess, ...settings.internetAccess }) : current.internetAccess,
        plugins: settings.plugins !== undefined ? (settings.plugins === null ? undefined : { ...current.plugins, ...settings.plugins }) : current.plugins,
        threeD: settings.threeD !== undefined ? (settings.threeD === null ? undefined : settings.threeD) : current.threeD
      };

      this.cachedSettings = updated;

      const tmpPath = `${settingsFilePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(updated, null, 2), 'utf-8');

      if (fs.existsSync(settingsFilePath)) {
        try {
          fs.copyFileSync(settingsFilePath, backupFilePath);
        } catch {
          // Preserve best-effort backup only.
        }
      }

      try {
        fs.renameSync(tmpPath, settingsFilePath);
      } catch (renameError) {
        try {
          fs.copyFileSync(tmpPath, settingsFilePath);
          fs.unlinkSync(tmpPath);
        } catch (copyError) {
          console.error('Failed to replace settings file atomically:', renameError, copyError);
        }
      }
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  /** Updates a single top-level settings key and persists. */
  public static updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.saveSettings({ [key]: value });
  }

  /** Applies a partial settings patch and persists. */
  public static updateSettings(patch: AppSettings): void {
    this.saveSettings(patch);
  }

  /** Clears the in-memory settings cache. */
  public static clearCache(): void {
    this.cachedSettings = null;
  }
}

/** Convenience wrapper to load AppSettings from disk. */
export function loadSettings(): AppSettings {
  return SettingsStorage.loadSettings();
}

/** Convenience wrapper to persist AppSettings to disk. */
export function saveSettings(settings: AppSettings): void {
  SettingsStorage.saveSettings(settings);
}

/** Convenience wrapper to update a single settings key. */
export function updateSettings<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  SettingsStorage.updateSetting(key, value);
}
