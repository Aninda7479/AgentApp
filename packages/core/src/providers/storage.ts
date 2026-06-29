import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { AIProvider, BYOKConfig } from '../types/agent.js';

export interface StorageOptions {
  storagePath?: string;
  secretKey?: string;
}

export interface CredentialInfo {
  provider: AIProvider;
  maskedKey: string;
  baseUrl?: string;
  modelName?: string;
}

export class SecureStorageManager {
  private storagePath: string;
  private secretKey: Buffer;

  constructor(options?: StorageOptions) {
    const defaultDir = path.join(os.homedir(), '.superagent');
    this.storagePath = options?.storagePath || path.join(defaultDir, 'credentials');
    const secret = options?.secretKey || 'superagent-secure-default-key-2026';
    // Derive a 32-byte key using scrypt
    this.secretKey = crypto.scryptSync(secret, 'superagent-salt-v1', 32);
  }

  private ensureDirectoryExists(): void {
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private encrypt(text: string): { iv: string; authTag: string; data: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.secretKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return {
      iv: iv.toString('hex'),
      authTag,
      data: encrypted
    };
  }

  private decrypt(encrypted: { iv: string; authTag: string; data: string }): string {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.secretKey,
      Buffer.from(encrypted.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
    let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private async loadAllRaw(): Promise<Record<string, BYOKConfig>> {
    if (!fs.existsSync(this.storagePath)) {
      return {};
    }
    try {
      const rawFile = fs.readFileSync(this.storagePath, 'utf8');
      if (!rawFile.trim()) {
        return {};
      }
      const encryptedObj = JSON.parse(rawFile);
      const jsonStr = this.decrypt(encryptedObj);
      return JSON.parse(jsonStr);
    } catch (err) {
      // In case of parsing error or decryption failure, return empty map safely
      return {};
    }
  }

  private async saveAllRaw(data: Record<string, BYOKConfig>): Promise<void> {
    this.ensureDirectoryExists();
    const jsonStr = JSON.stringify(data);
    const encryptedObj = this.encrypt(jsonStr);
    fs.writeFileSync(this.storagePath, JSON.stringify(encryptedObj, null, 2), 'utf8');
  }

  public async saveCredential(config: BYOKConfig): Promise<void> {
    if (!config.apiKey && config.provider !== 'custom') {
      throw new Error(`API key is required for provider: ${config.provider}`);
    }
    const all = await this.loadAllRaw();
    all[config.provider] = { ...config };
    await this.saveAllRaw(all);
  }

  public async getCredential(provider: AIProvider): Promise<BYOKConfig | null> {
    const all = await this.loadAllRaw();
    const cred = all[provider];
    return cred ? { ...cred } : null;
  }

  public async deleteCredential(provider: AIProvider): Promise<boolean> {
    const all = await this.loadAllRaw();
    if (all[provider]) {
      delete all[provider];
      await this.saveAllRaw(all);
      return true;
    }
    return false;
  }

  public async listCredentials(): Promise<CredentialInfo[]> {
    const all = await this.loadAllRaw();
    return Object.values(all).map(config => ({
      provider: config.provider,
      maskedKey: this.maskKey(config.apiKey),
      baseUrl: config.baseUrl,
      modelName: config.modelName
    }));
  }

  public async clear(): Promise<void> {
    if (fs.existsSync(this.storagePath)) {
      fs.unlinkSync(this.storagePath);
    }
  }

  private maskKey(key: string): string {
    if (!key || key.length <= 8) {
      return '****';
    }
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }
}
