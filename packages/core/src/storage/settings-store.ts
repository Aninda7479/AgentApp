import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ThemeSettings {
  desktop?: 'light' | 'dark' | 'system';
  cli?: 'light' | 'dark' | 'system' | string;
}

export interface ProviderSettings {
  id: string;
  name: string;
  type: 'env' | 'key' | 'custom';
  apiKey: string;
  baseUrl: string;
}

export interface ModelPricing {
  inputPer1M?: string;
  outputPer1M?: string;
  cachedInputPer1M?: string;
}

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

export interface LastUsedModelSettings {
  provider?: string;
  model?: string;
}

export interface GeneralAppSettings {
  workMode?: 'coding' | 'everyday';
  confirmShellCommands?: boolean;
  autoReviewPlan?: boolean;
  unsandboxedActions?: boolean;
}

export interface ModelGovSettings {
  enabledModels?: string[];
  autoUpdateInstructions?: boolean;
  optimizationGoal?: 'quality' | 'cost' | 'balanced';
  routingStrategy?: 'orchestrator' | 'router';
  categoryOverrides?: Record<string, string>;
}

export interface BrowserUseSettings {
  headless?: boolean;
  width?: number;
  height?: number;
  userAgent?: string;
  timeout?: number;
}

export interface ComputerUseSettings {
  enableMouse?: boolean;
  enableKeyboard?: boolean;
  actionDelay?: number;
}

export interface AppSettings {
  theme?: ThemeSettings;
  providers?: ProviderSettings[];
  models?: ModelSettings[];
  lastUsedModel?: LastUsedModelSettings;
  general?: GeneralAppSettings;
  modelGov?: ModelGovSettings;
  browserUse?: BrowserUseSettings;
  computerUse?: ComputerUseSettings;
}

export interface SettingsPaths {
  userDataDirectory: string;
  configDirectory: string;
  settingsFilePath: string;
  backupFilePath: string;
}

export function getUserDataDirectory(): string {
  if (process.env.VITEST) {
    const workerId = process.env.VITEST_WORKER_ID || '1';
    return path.join(process.cwd(), 'tmp', `test_tmp_settings_dir_${workerId}`);
  }

  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'OpenSource', 'AgentApp');
  }

  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'OpenSource', 'AgentApp');
  }

  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'OpenSource', 'AgentApp');
}

export function getSettingsPaths(baseDirectory = getUserDataDirectory()): SettingsPaths {
  const configDirectory = path.join(baseDirectory, 'Config');
  const settingsFilePath = path.join(configDirectory, 'settings.json');
  return {
    userDataDirectory: baseDirectory,
    configDirectory,
    settingsFilePath,
    backupFilePath: `${settingsFilePath}.bak`
  };
}

export function getConfigDirectory(): string {
  const { configDirectory } = getSettingsPaths();
  if (!fs.existsSync(configDirectory)) {
    fs.mkdirSync(configDirectory, { recursive: true });
  }
  return configDirectory;
}

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

export class SettingsStorage {
  private static cachedSettings: AppSettings | null = null;

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

  public static saveSettings(settings: AppSettings): void {
    try {
      const { configDirectory, settingsFilePath, backupFilePath } = getSettingsPaths();
      fs.mkdirSync(configDirectory, { recursive: true });

      const current = this.loadSettings();
      const updated: AppSettings = {
        theme: settings.theme !== undefined ? { ...current.theme, ...settings.theme } : current.theme,
        providers: settings.providers !== undefined ? settings.providers : current.providers,
        models: settings.models !== undefined ? settings.models : current.models,
        lastUsedModel: settings.lastUsedModel !== undefined ? { ...current.lastUsedModel, ...settings.lastUsedModel } : current.lastUsedModel,
        general: settings.general !== undefined ? { ...current.general, ...settings.general } : current.general,
        modelGov: settings.modelGov !== undefined ? { ...current.modelGov, ...settings.modelGov } : current.modelGov
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

  public static updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.saveSettings({ [key]: value });
  }

  public static updateSettings(patch: AppSettings): void {
    this.saveSettings(patch);
  }

  public static clearCache(): void {
    this.cachedSettings = null;
  }
}

export function loadSettings(): AppSettings {
  return SettingsStorage.loadSettings();
}

export function saveSettings(settings: AppSettings): void {
  SettingsStorage.saveSettings(settings);
}

export function updateSettings<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  SettingsStorage.updateSetting(key, value);
}
