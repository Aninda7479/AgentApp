import { BYOKConfig, AIProvider } from '../types/agent.js';
import { SecureStorageManager, StorageOptions } from './storage.js';

export class BYOKProviderManager {
  private configs: Map<string, BYOKConfig> = new Map();
  private storageManager?: SecureStorageManager;

  constructor(storageOptions?: StorageOptions) {
    if (storageOptions) {
      this.storageManager = new SecureStorageManager(storageOptions);
    }
  }

  public registerKey(config: BYOKConfig): void {
    if (!config.apiKey && config.provider !== 'custom') {
      throw new Error(`API key is required for provider: ${config.provider}`);
    }
    this.configs.set(config.provider, config);
  }

  public async registerAndPersistKey(config: BYOKConfig): Promise<void> {
    this.registerKey(config);
    if (this.storageManager) {
      await this.storageManager.saveCredential(config);
    }
  }

  public getKey(provider: string): BYOKConfig | undefined {
    return this.configs.get(provider);
  }

  public getAllConfigs(): BYOKConfig[] {
    return Array.from(this.configs.values());
  }

  public getActiveConfig(): BYOKConfig {
    const active = Array.from(this.configs.values())[0];
    if (!active) {
      throw new Error('No BYOK API key configured. Please configure an API key in settings or CLI.');
    }
    return active;
  }

  public async loadFromStorage(storageManager?: SecureStorageManager): Promise<void> {
    const storage = storageManager || this.storageManager;
    if (!storage) return;
    const creds = await storage.listCredentials();
    for (const item of creds) {
      const fullCred = await storage.getCredential(item.provider);
      if (fullCred) {
        this.registerKey(fullCred);
      }
    }
  }
}
