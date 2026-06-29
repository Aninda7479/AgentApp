import * as fs from 'fs/promises';
import * as path from 'path';

export interface UserProfileEntry {
  key: string;
  value: unknown;
  category: 'preference' | 'identity' | 'environment' | 'custom';
  updatedAt: number;
}

export interface UserProfileData {
  entries: Record<string, UserProfileEntry>;
}

export class UserProfileStore {
  private filePath: string;
  private memoryCache: UserProfileData = { entries: {} };
  private loaded: boolean = false;

  constructor(customPath?: string) {
    this.filePath = customPath || path.join(process.cwd(), 'logs', 'user_profile.json');
  }

  private sanitizeValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.replace(/sk-[a-zA-Z0-9_-]+/g, '[REDACTED_TOKEN]');
    }
    if (Array.isArray(value)) {
      return value.map(item => this.sanitizeValue(item));
    }
    if (value !== null && typeof value === 'object') {
      const sanitizedObj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (k.toLowerCase().includes('key') || k.toLowerCase().includes('token') || k.toLowerCase().includes('secret')) {
          sanitizedObj[k] = '[REDACTED_SENSITIVE_DATA]';
        } else {
          sanitizedObj[k] = this.sanitizeValue(v);
        }
      }
      return sanitizedObj;
    }
    return value;
  }

  public async load(): Promise<UserProfileData> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(content) as UserProfileData;
      this.memoryCache = parsed && parsed.entries ? parsed : { entries: {} };
    } catch (err) {
      if ((err as { code?: string }).code === 'ENOENT') {
        this.memoryCache = { entries: {} };
      } else {
        throw err;
      }
    }
    this.loaded = true;
    return this.memoryCache;
  }

  public async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.memoryCache, null, 2), 'utf-8');
  }

  public async get(key: string): Promise<UserProfileEntry | undefined> {
    if (!this.loaded) {
      await this.load();
    }
    return this.memoryCache.entries[key];
  }

  public async set(
    key: string,
    value: unknown,
    category: UserProfileEntry['category'] = 'custom'
  ): Promise<UserProfileEntry> {
    if (!this.loaded) {
      await this.load();
    }

    const sanitized = this.sanitizeValue(value);
    const entry: UserProfileEntry = {
      key,
      value: sanitized,
      category,
      updatedAt: Date.now()
    };

    this.memoryCache.entries[key] = entry;
    await this.save();
    return entry;
  }

  public async delete(key: string): Promise<boolean> {
    if (!this.loaded) {
      await this.load();
    }

    if (this.memoryCache.entries[key]) {
      delete this.memoryCache.entries[key];
      await this.save();
      return true;
    }
    return false;
  }

  public async search(query: string): Promise<UserProfileEntry[]> {
    if (!this.loaded) {
      await this.load();
    }

    const q = query.toLowerCase();
    const results: UserProfileEntry[] = [];

    for (const entry of Object.values(this.memoryCache.entries)) {
      const keyMatch = entry.key.toLowerCase().includes(q);
      const categoryMatch = entry.category.toLowerCase().includes(q);
      let valueMatch = false;

      if (typeof entry.value === 'string') {
        valueMatch = entry.value.toLowerCase().includes(q);
      } else if (typeof entry.value === 'number' || typeof entry.value === 'boolean') {
        valueMatch = String(entry.value).toLowerCase().includes(q);
      }

      if (keyMatch || categoryMatch || valueMatch) {
        results.push(entry);
      }
    }

    return results;
  }

  public async listAll(): Promise<UserProfileEntry[]> {
    if (!this.loaded) {
      await this.load();
    }
    return Object.values(this.memoryCache.entries);
  }
}
