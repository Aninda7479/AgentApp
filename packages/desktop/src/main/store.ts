/**
 * Persistent JSON store for SuperAgent Desktop.
 * Reads/writes a single JSON file in Electron's userData directory.
 * No external dependencies — just Node's built-in `fs`.
 *
 * ponytail: flat JSON file is sufficient; switch to SQLite only if
 *           query performance becomes an issue.
 */
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface StoredProvider {
  id: string;
  name: string;
  type: 'env' | 'key' | 'custom';
  apiKey: string;
  baseUrl: string;
}

export interface StoredModel {
  id: string;
  name: string;
  providerId: string;
  enabled: boolean;
  description?: string;
  contextLimit?: string;
  outputLimit?: string;
  inputModalities?: string[];
  outputModalities?: string[];
  pricing?: { inputPer1M?: string; outputPer1M?: string; cachedInputPer1M?: string };
  caching?: boolean;
  type?: string;
}

export interface StoreData {
  connectedProviders: StoredProvider[];
  modelsCatalog: StoredModel[];
}

const EMPTY_STORE: StoreData = {
  connectedProviders: [],
  modelsCatalog: []
};

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'providers-store.json');
}

export function readStore(): StoreData {
  const storePath = getStorePath();
  try {
    if (!fs.existsSync(storePath)) return EMPTY_STORE;
    const raw = fs.readFileSync(storePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    return {
      connectedProviders: parsed.connectedProviders ?? [],
      modelsCatalog: parsed.modelsCatalog ?? []
    };
  } catch {
    // Corrupted or unreadable — start fresh
    return EMPTY_STORE;
  }
}

export function writeStore(data: StoreData): void {
  const storePath = getStorePath();
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8');
}
