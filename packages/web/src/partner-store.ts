import fs from 'fs';
import path from 'path';
import { STORAGE_DIRS } from '@superagent/core';

/**
 * Web-build Partner store. Mirrors the desktop `partner-store` (packages/desktop
 * src/main/partner-store.ts) but is fully self-contained — it only touches the
 * filesystem under `~/.superagent/partners` and has no Electron/desktop dependencies.
 *
 * The desktop build ships the 3D Lily assets next to its compiled binary; the
 * web build has no 3D pet, so only the Partner manifest *metadata* (name, emoji,
 * reactions, etc.) is meaningful here — it is reused by the chat mascot. The
 * built-in Lily Partner is therefore returned as an in-memory default without
 * any on-disk 3D asset resolution.
 */

const ACTIVE_FILE = 'active.json';

const DEFAULT_LILY_MANIFEST: Record<string, unknown> = {
  schema: 'superagent-partner',
  id: 'lily',
  name: 'Lily',
  kind: 'girl',
  version: '1.0.0',
  description: 'A cute anime companion who works, sleeps, and keeps you company.',
  author: 'SuperAgent',
  accent: '#ff8fb3',
  emoji: '🧍',
  // 3D asset — unused in the web build (no pet window), kept for schema parity.
  model: 'models/lily/v1/girl_web.glb',
  faceOverlay: false,
  laptop: true,
  pillow: true,
  reactions: {
    idle:      { emoji: '🧍', line: 'Ready when you are.' },
    thinking:  { emoji: '🤔', line: 'Hmm, let me think…' },
    working:   { emoji: '💻', line: 'On it!' },
    happy:     { emoji: '🙂', line: 'Nice.' },
    celebrate: { emoji: '🎉', line: 'Done!' },
    sad:       { emoji: '😢', line: 'That didn\'t go well.' },
    sleeping:  { emoji: '😴', line: 'zzz' }
  }
};

function petsDir(userData: string): string {
  return path.join(userData, STORAGE_DIRS.partners);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Basic structural validation mirroring the desktop schema (kept dependency-free). */
function isValidManifest(raw: any): raw is Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.schema !== 'superagent-partner') return false;
  if (typeof raw.id !== 'string' || !/^[a-z0-9_-]+$/i.test(raw.id)) return false;
  if (typeof raw.name !== 'string' || !raw.name) return false;
  if (typeof raw.kind !== 'string' || !raw.kind) return false;
  if (typeof raw.description !== 'string' || !raw.description) return false;
  return true;
}

/** Lists all installed Partner manifests plus the built-in Lily default. */
export function listPartners(userData: string): Record<string, unknown>[] {
  const dir = petsDir(userData);
  const out: Record<string, unknown>[] = [];

  const lilyCopy = JSON.parse(JSON.stringify(DEFAULT_LILY_MANIFEST));
  lilyCopy.folder = path.join(petsDir(userData), 'lily');
  out.push(lilyCopy);

  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'lily') continue;
      const folder = path.join(dir, entry.name);
      const manifest = readJson<Record<string, unknown>>(path.join(folder, 'partner.json'));
      if (manifest && isValidManifest(manifest)) {
        manifest.folder = folder;
        out.push(manifest);
      }
    }
  }
  return out;
}

/** Reads a single Partner manifest by id (null if not installed). */
export function getPartner(userData: string, id: string): Record<string, unknown> | null {
  if (id === 'lily') {
    const lilyCopy = JSON.parse(JSON.stringify(DEFAULT_LILY_MANIFEST));
    lilyCopy.folder = path.join(petsDir(userData), 'lily');
    return lilyCopy;
  }
  const folder = path.join(petsDir(userData), id);
  const manifest = readJson<Record<string, unknown>>(path.join(folder, 'partner.json'));
  if (manifest && isValidManifest(manifest)) {
    manifest.folder = folder;
    return manifest;
  }
  return null;
}

/** Persists the active Partner id. */
export function setActivePartner(userData: string, id: string | null): void {
  const file = path.join(petsDir(userData), ACTIVE_FILE);
  ensureDir(petsDir(userData));
  fs.writeFileSync(file, JSON.stringify({ id }), 'utf-8');
}

/** Reads the active Partner id (or null). */
export function getActivePartner(userData: string): string | null {
  const data = readJson<{ id: string | null }>(path.join(petsDir(userData), ACTIVE_FILE));
  return data?.id ?? null;
}

/** Removes an installed Partner folder by id. */
export function removePartner(userData: string, id: string): void {
  const dest = path.join(petsDir(userData), id);
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
}

/** Installs a Partner from a raw JSON string into its own folder. */
export function importPartnerJson(userData: string, json: string): { manifest: Record<string, unknown> } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error('Invalid JSON: ' + (e as Error).message);
  }
  if (!isValidManifest(parsed)) {
    throw new Error('Not a valid Partner manifest (needs id, name, kind, description, schema).');
  }
  const id = String((parsed as any).id);
  const dest = path.join(petsDir(userData), id);
  ensureDir(dest);
  fs.writeFileSync(path.join(dest, 'partner.json'), JSON.stringify(parsed, null, 2), 'utf-8');
  return { manifest: parsed as Record<string, unknown> };
}

/** Returns the on-disk folder path for a Partner (used by export / reveal). */
export function partnerFolderPath(userData: string, id: string): string {
  return path.join(petsDir(userData), id);
}
