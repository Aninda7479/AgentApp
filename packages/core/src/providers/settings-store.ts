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

export interface AppSettings {
  theme?: ThemeSettings;
  providers?: ProviderSettings[];
  models?: ModelSettings[];
  lastUsedModel?: LastUsedModelSettings;
  general?: GeneralAppSettings;
}

export function getUserDataDirectory(): string {
  if (process.env.VITEST) {
    const workerId = process.env.VITEST_WORKER_ID || '1';
    return path.join(process.cwd(), `test_tmp_settings_dir_${workerId}`);
  }
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'OpenSource', 'AgentApp');
  } else if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'OpenSource', 'AgentApp');
  } else {
    return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'OpenSource', 'AgentApp');
  }
}

export function getConfigDirectory(): string {
  const configDir = path.join(getUserDataDirectory(), 'Config');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return configDir;
}

export function getSettingsFilePath(): string {
  return path.join(getConfigDirectory(), 'settings.json');
}

export class SettingsStorage {
  private static cachedSettings: AppSettings | null = null;

  public static loadSettings(): AppSettings {
    const filePath = getSettingsFilePath();
    const backupPath = filePath + '.bak';

    // Try reading primary
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8').trim();
        if (raw) {
          const parsed = JSON.parse(raw);
          this.cachedSettings = parsed;
          return parsed || {};
        }
      }
    } catch (e) {
      console.error('Failed to parse settings.json, trying backup...', e);
    }

    // Try reading backup
    try {
      if (fs.existsSync(backupPath)) {
        const raw = fs.readFileSync(backupPath, 'utf-8').trim();
        if (raw) {
          const parsed = JSON.parse(raw);
          this.cachedSettings = parsed;
          return parsed || {};
        }
      }
    } catch (e) {
      console.error('Failed to parse backup settings.json.bak:', e);
    }

    return this.cachedSettings || {};
  }

  public static saveSettings(settings: AppSettings): void {
    try {
      const filePath = getSettingsFilePath();
      const tmpPath = filePath + '.tmp';
      const backupPath = filePath + '.bak';
      getConfigDirectory();
      
      const current = this.loadSettings();
      
      const updated: AppSettings = {
        theme: settings.theme !== undefined ? { ...current.theme, ...settings.theme } : current.theme,
        providers: settings.providers !== undefined ? settings.providers : current.providers,
        models: settings.models !== undefined ? settings.models : current.models,
        lastUsedModel: settings.lastUsedModel !== undefined ? { ...current.lastUsedModel, ...settings.lastUsedModel } : current.lastUsedModel,
        general: settings.general !== undefined ? { ...current.general, ...settings.general } : current.general
      };
      
      this.cachedSettings = updated;
      
      // 1. Write atomically to temporary file
      fs.writeFileSync(tmpPath, JSON.stringify(updated, null, 2), 'utf-8');

      // 2. Backup current settings file if it exists
      if (fs.existsSync(filePath)) {
        try {
          fs.copyFileSync(filePath, backupPath);
        } catch {
          // ignore backup errors
        }
      }

      // 3. Rename atomically to replace settings file
      fs.renameSync(tmpPath, filePath);
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  public static updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.saveSettings({ [key]: value });
  }
}
