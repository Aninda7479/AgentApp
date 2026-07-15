import fs from 'fs';
import path from 'path';
import url from 'url';
import { logError } from './error-log.js';

/**
 * Main-process store for the open Partner/Pet ecosystem.
 *
 * Each Partner lives in its own folder under `<userData>/pets/<id>/` containing
 * a `partner.json` manifest (plus optional asset files). This module is the
 * authoritative source for import / export / remove / active selection; the
 * renderer talks to it over IPC. It intentionally avoids importing any renderer
 * code so it stays free of React/browser dependencies.
 */

const ACTIVE_FILE = 'active.json';

const DEFAULT_LILY_MANIFEST = {
  schema: 'superagent-partner',
  id: 'lily',
  name: 'Lily',
  kind: 'girl',
  version: '1.0.0',
  description: 'A cute anime companion who works, sleeps, and keeps you company.',
  author: 'SuperAgent',
  accent: '#ff8fb3',
  emoji: '🧍',
  // Real 3D mesh (AI-generated girl, optimized to ~893KB glTF via Meshopt/WebP).
  // Loaded by the pet's GLBCharacter (three.js GLTFLoader) with the procedural
  // face overlay so Lily still emotes. Falls back to the procedural Lily if missing.
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

export interface StoredPartner {
  id: string;
  folder: string;
  manifest: Record<string, unknown>;
}

function petsDir(userData: string): string {
  return path.join(userData, 'pets');
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

/** Basic structural validation mirroring the renderer schema (kept dependency-free). */
function isValidManifest(raw: any): raw is Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.schema !== 'superagent-partner') return false;
  if (typeof raw.id !== 'string' || !/^[a-z0-9_-]+$/i.test(raw.id)) return false;
  if (typeof raw.name !== 'string' || !raw.name) return false;
  if (typeof raw.kind !== 'string' || !raw.kind) return false;
  if (typeof raw.description !== 'string' || !raw.description) return false;
  return true;
}

function applyDynamicMetadata(manifest: any, folder: string): void {
  const scriptFile = manifest && typeof manifest.script === 'string' ? manifest.script : null;
  if (!scriptFile) return;

  let scriptPath = '';
  if (manifest.id === 'lily' && (scriptFile.startsWith('models/') || scriptFile.startsWith('dist/'))) {
    scriptPath = path.join(__dirname, '..', scriptFile);
    if (!fs.existsSync(scriptPath)) {
      scriptPath = path.join(__dirname, scriptFile);
    }
  } else {
    scriptPath = path.join(folder, scriptFile);
  }

  if (fs.existsSync(scriptPath)) {
    try {
      delete require.cache[require.resolve(scriptPath)];
      const mod = require(scriptPath);
      if (mod) {
        if (typeof mod.name === 'string') manifest.name = mod.name;
        if (typeof mod.desc === 'string') manifest.description = mod.desc;
        else if (typeof mod.description === 'string') manifest.description = mod.description;
        if (typeof mod.type === 'string') manifest.kind = mod.type;
        else if (typeof mod.kind === 'string') manifest.kind = mod.kind;

        if (typeof mod.dp === 'string') {
          manifest.emoji = mod.dp;
          if (/\.(png|jpg|jpeg|webp|gif)$/i.test(mod.dp)) {
            manifest.dp = mod.dp;
            const dpPath = path.join(folder, mod.dp);
            manifest.dpPath = dpPath;
            manifest.dpUrl = url.pathToFileURL(dpPath).href;
          } else {
            manifest.dp = undefined;
            manifest.dpPath = undefined;
            manifest.dpUrl = undefined;
          }
        } else if (typeof mod.emoji === 'string') {
          manifest.emoji = mod.emoji;
          manifest.dp = undefined;
          manifest.dpPath = undefined;
          manifest.dpUrl = undefined;
        }
      }
    } catch (e) {
      logError('partner:dynamic-metadata ' + scriptPath, e);
    }
  }
}

/** Lists all installed Partner manifests. */
export function listPartners(userData: string): Record<string, unknown>[] {
  const dir = petsDir(userData);
  const out: Record<string, unknown>[] = [];

  // 1. Add built-in Lily partner with dynamic metadata
  const lilyCopy = JSON.parse(JSON.stringify(DEFAULT_LILY_MANIFEST));
  const lilyFolder = path.join(__dirname, '..');
  lilyCopy.folder = lilyFolder;
  applyDynamicMetadata(lilyCopy, lilyFolder);
  out.push(lilyCopy);

  // 2. Add custom installed partners
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'lily') continue;
      const folder = path.join(dir, entry.name);
      const manifestPath = path.join(folder, 'partner.json');
      const manifest = readJson<Record<string, unknown>>(manifestPath);
      if (manifest && isValidManifest(manifest)) {
        (manifest as any).folder = folder;
        applyDynamicMetadata(manifest, folder);
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
    const lilyFolder = path.join(__dirname, '..');
    lilyCopy.folder = lilyFolder;
    applyDynamicMetadata(lilyCopy, lilyFolder);
    return lilyCopy;
  }
  const folder = path.join(petsDir(userData), id);
  const manifestPath = path.join(folder, 'partner.json');
  const manifest = readJson<Record<string, unknown>>(manifestPath);
  if (manifest && isValidManifest(manifest)) {
    (manifest as any).folder = folder;
    applyDynamicMetadata(manifest, folder);
    return manifest;
  }
  return null;
}

/** Copies a Partner folder (chosen by the user) into the pets directory. */
export function installPartnerFolder(userData: string, sourceFolder: string): { manifest: Record<string, unknown> } {
  if (!fs.existsSync(sourceFolder) || !fs.statSync(sourceFolder).isDirectory()) {
    throw new Error('Selected path is not a folder.');
  }
  const manifestPath = path.join(sourceFolder, 'partner.json');
  const manifest = readJson<Record<string, unknown>>(manifestPath);
  if (!manifest || !isValidManifest(manifest)) {
    throw new Error('Folder has no valid partner.json (needs schema: "superagent-partner").');
  }
  const id = String((manifest as any).id);
  const dest = path.join(petsDir(userData), id);
  ensureDir(dest);
  fs.cpSync(sourceFolder, dest, { recursive: true });
  return { manifest };
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

/** Removes an installed Partner folder by id. */
export function removePartner(userData: string, id: string): void {
  const dest = path.join(petsDir(userData), id);
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
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

/** Returns the on-disk folder path for a Partner (used by export / reveal). */
export function partnerFolderPath(userData: string, id: string): string {
  return path.join(petsDir(userData), id);
}
