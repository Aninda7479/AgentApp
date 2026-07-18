import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_PARTNERS
} from './defaultPartners';
import {
  normalizeManifest,
  validatePartnerManifest,
  type PartnerManifest,
  type ValidateResult
} from '../../../partner-popup/types';

/**
 * Storage abstraction for the open Partner ecosystem.
 *
 * In the Electron desktop app this talks to the main process over IPC, which
 * reads/writes `partner.json` folders under the user-data `pets/` directory.
 * In the web build (or under test) there is no IPC, so it degrades gracefully
 * to localStorage — the UI stays fully functional and the same code path is
 * exercised.
 */

const LS_INSTALLED = 'superagent.partners.installed';
const LS_ACTIVE = 'superagent.partners.active';

/** Lazily resolves the Electron ipcRenderer, or null outside the desktop shell. */
function getIpc(): any | null {
  if (typeof window === 'undefined') return null;
  const req = (window as any).require;
  if (!req) return null;
  try {
    return req('electron').ipcRenderer;
  } catch {
    return null;
  }
}

function lsReadInstalled(): PartnerManifest[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_INSTALLED);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((p) => normalizeManifest(p)) : [];
  } catch {
    return [];
  }
}

function lsWriteInstalled(list: PartnerManifest[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_INSTALLED, JSON.stringify(list));
  } catch {
    /* ignore quota errors */
  }
}

function lsReadActive(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LS_ACTIVE);
  } catch {
    return null;
  }
}

function lsWriteActive(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (id) window.localStorage.setItem(LS_ACTIVE, id);
    else window.localStorage.removeItem(LS_ACTIVE);
  } catch {
    /* ignore */
  }
}

/**
 * Merges the built-in default Partners with user-installed ones, de-duplicating
 * by id (installed wins on conflict so edits persist).
 */
export function mergePets(
  defaults: PartnerManifest[],
  installed: PartnerManifest[]
): PartnerManifest[] {
  const byId = new Map<string, PartnerManifest>();
  for (const p of defaults) byId.set(p.id, p);
  for (const p of installed) byId.set(p.id, p);
  const seen = new Set<string>();
  const out: PartnerManifest[] = [];
  // Keep a stable order: defaults first, then any extra installed ones.
  for (const p of [...defaults, ...installed]) {
    if (seen.has(p.id)) continue;
    const merged = byId.get(p.id);
    if (merged) {
      out.push(merged);
      seen.add(p.id);
    }
  }
  return out;
}

export const PartnerLibrary = {
  /** Lists installed (user) Partners from disk / localStorage. */
  async list(): Promise<PartnerManifest[]> {
    const ipc = getIpc();
    if (ipc) {
      try {
        const res = await ipc.invoke('partner-list');
        if (Array.isArray(res)) return res.map((p: any) => normalizeManifest(p));
      } catch {
        /* fall through */
      }
    }
    return lsReadInstalled();
  },

  /** Reads the currently active Partner id. */
  async getActiveId(): Promise<string | null> {
    const ipc = getIpc();
    if (ipc) {
      try {
        const res = await ipc.invoke('partner-get-active');
        if (typeof res === 'string' || res === null) return res;
      } catch {
        /* fall through */
      }
    }
    return lsReadActive();
  },

  /** Persists the active Partner id. */
  async setActive(id: string | null): Promise<void> {
    const ipc = getIpc();
    if (ipc) {
      try {
        await ipc.invoke('partner-set-active', id);
        return;
      } catch {
        /* fall through */
      }
    }
    lsWriteActive(id);
  },

  /** Opens a folder picker (desktop) to import a Partner folder. Returns the installed manifest or null. */
  async installFromFolder(): Promise<PartnerManifest | null> {
    const ipc = getIpc();
    if (!ipc) return null;
    const res = await ipc.invoke('partner-install');
    if (res && res.manifest) return normalizeManifest(res.manifest);
    return null;
  },

  /** Installs a Partner from a raw JSON string. Validates, then persists. */
  async installFromJson(json: string): Promise<PartnerManifest> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      throw new Error('Invalid JSON: ' + (e as Error).message);
    }
    const result: ValidateResult = validatePartnerManifest(parsed);
    if (!result.ok) throw new Error(result.error);

    const ipc = getIpc();
    if (ipc) {
      try {
        const res = await ipc.invoke('partner-import-json', json);
        if (res && res.manifest) return normalizeManifest(res.manifest);
      } catch (e) {
        throw new Error((e as Error).message);
      }
    }
    // Web / test fallback: keep in localStorage.
    const installed = lsReadInstalled();
    const next = mergePets([], [...installed, result.manifest]);
    lsWriteInstalled(next.filter((p) => !DEFAULT_PARTNERS.some((d) => d.id === p.id)));
    return result.manifest;
  },

  /** Removes an installed Partner by id. */
  async remove(id: string): Promise<void> {
    const ipc = getIpc();
    if (ipc) {
      try {
        await ipc.invoke('partner-remove', id);
        return;
      } catch {
        /* fall through */
      }
    }
    const installed = lsReadInstalled().filter((p) => p.id !== id);
    lsWriteInstalled(installed);
  },

  /** Reveals/exports an installed Partner (desktop: opens its folder). */
  async exportPet(id: string): Promise<void> {
    const ipc = getIpc();
    if (ipc) {
      try {
        await ipc.invoke('partner-export', id);
      } catch {
        /* ignore */
      }
    }
  },

  /** Opens a native file picker for a 3D model. Returns the chosen path or null. */
  async pickModelFile(): Promise<string | null> {
    const ipc = getIpc();
    if (!ipc) return null;
    try {
      const res = await ipc.invoke('partner-pick-model-file');
      if (res && typeof res === 'string') return res;
    } catch {
      /* ignore */
    }
    return null;
  },

  /** Opens a native folder picker for a 3D model folder. Returns the chosen path or null. */
  async pickModelFolder(): Promise<string | null> {
    const ipc = getIpc();
    if (!ipc) return null;
    try {
      const res = await ipc.invoke('partner-pick-model-folder');
      if (res && typeof res === 'string') return res;
    } catch {
      /* ignore */
    }
    return null;
  },

  /**
   * Attaches a 3D model file to a Partner: copies it into the Partner's folder
   * and records it in the manifest. Persists the user's "which model I imported"
   * choice. Returns the stored model filename or null.
   */
  async importModel(id: string, sourcePath: string): Promise<string | null> {
    const ipc = getIpc();
    if (!ipc) return null;
    try {
      const res = await ipc.invoke('partner-import-model', { id, sourcePath });
      if (res && res.ok) return res.model;
    } catch {
      /* ignore */
    }
    return null;
  },

  /**
   * Imports a 3D model *folder* into a Partner: copies it into the Partner's
   * `src/` directory, compiles its TypeScript to JS, and records the folder in
   * the manifest as `modelFolder`. Returns the stored `modelFolder` path or null.
   */
  async importModelFolder(id: string, sourcePath: string): Promise<string | null> {
    const ipc = getIpc();
    if (!ipc) return null;
    try {
      const res = await ipc.invoke('partner-import-model-folder', { id, sourcePath });
      if (res && res.ok) return res.modelFolder;
      if (res && res.error) console.error('[partner] import model folder failed:', res.error);
    } catch (e) {
      console.error('[partner] import model folder failed:', e);
    }
    return null;
  },

  /** Starts the single 3D desktop pet (manual launch; never auto-starts). */
  async startPet(): Promise<boolean> {
    const ipc = getIpc();
    if (!ipc) return false;
    const res = await ipc.invoke('pet-start');
    return !!res?.running;
  },

  /** Stops / closes the 3D desktop pet. */
  async stopPet(): Promise<boolean> {
    const ipc = getIpc();
    if (!ipc) return false;
    const res = await ipc.invoke('pet-stop');
    return !!res?.running;
  },

  /** Queries whether the 3D desktop pet is currently running. */
  async petStatus(): Promise<boolean> {
    const ipc = getIpc();
    if (!ipc) return false;
    const res = await ipc.invoke('pet-status');
    return !!res?.running;
  }
};

export const DEFAULT_ACTIVE_ID = DEFAULT_PARTNERS[0]?.id ?? null;

/**
 * Single source of truth for Partner state, used by the App shell and shared
 * with the gallery view and the floating overlay.
 */
export function usePartners() {
  const [pets, setPets] = useState<PartnerManifest[]>(DEFAULT_PARTNERS);
  const [activeId, setActiveId] = useState<string | null>(DEFAULT_ACTIVE_ID);
  const [petRunning, setPetRunning] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Local storage cleanup for legacy pets
      if (typeof window !== 'undefined') {
        try {
          const raw = window.localStorage.getItem(LS_INSTALLED);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              const filtered = list.filter((p) => p.id !== 'waifu' && p.id !== 'pixel' && p.id !== 'byte' && p.id !== 'nova');
              if (filtered.length !== list.length) {
                window.localStorage.setItem(LS_INSTALLED, JSON.stringify(filtered));
              }
            }
          }
          const active = window.localStorage.getItem(LS_ACTIVE);
          if (active === 'waifu' || active === 'pixel' || active === 'byte' || active === 'nova') {
            window.localStorage.setItem(LS_ACTIVE, 'lily');
          }
        } catch {}
      }

      const [installed, active] = await Promise.all([
        PartnerLibrary.list(),
        PartnerLibrary.getActiveId()
      ]);
      if (cancelled) return;
      const merged = mergePets(DEFAULT_PARTNERS, installed);
      setPets(merged);
      setActiveId(
        active && merged.some((p) => p.id === active) ? active : merged[0]?.id ?? null
      );
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror the pet's running state from the main process (and on Ctrl+Q close).
  useEffect(() => {
    const ipc = getIpc();
    if (!ipc) return;
    ipc.invoke('pet-status').then((r: any) => setPetRunning(!!r?.running)).catch(() => {});
    const onRunning = (_e: unknown, running: boolean) => setPetRunning(!!running);
    ipc.on('pet-running', onRunning);
    return () => ipc.removeListener('pet-running', onRunning);
  }, []);

  const setActive = useCallback(async (id: string | null) => {
    setActiveId(id);
    await PartnerLibrary.setActive(id);
  }, []);

  const installFromFolder = useCallback(async () => {
    const p = await PartnerLibrary.installFromFolder();
    if (p) {
      setPets((prev) => mergePets(prev, [p]));
      setActiveId(p.id);
    }
    return p;
  }, []);

  const installFromJson = useCallback(async (json: string) => {
    const p = await PartnerLibrary.installFromJson(json);
    setPets((prev) => mergePets(prev, [p]));
    return p;
  }, []);

  const remove = useCallback(async (id: string) => {
    await PartnerLibrary.remove(id);
    setPets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      return next;
    });
    setActiveId((cur) => (cur === id ? DEFAULT_PARTNERS[0]?.id ?? null : cur));
  }, []);

  const exportPet = useCallback((id: string) => PartnerLibrary.exportPet(id), []);

  const importModel = useCallback(async (id: string, filePath: string) => {
    const model = await PartnerLibrary.importModel(id, filePath);
    // Refresh the list so the attached model filename shows on the card.
    const installed = await PartnerLibrary.list();
    const merged = mergePets(DEFAULT_PARTNERS, installed);
    setPets(merged);
    return model;
  }, []);

  const importModelFolder = useCallback(async (id: string, folderPath: string) => {
    const modelFolder = await PartnerLibrary.importModelFolder(id, folderPath);
    // Refresh the list so the attached model folder shows on the card.
    const installed = await PartnerLibrary.list();
    const merged = mergePets(DEFAULT_PARTNERS, installed);
    setPets(merged);
    return modelFolder;
  }, []);

  const startPet = useCallback(async () => {
    const running = await PartnerLibrary.startPet();
    setPetRunning(running);
  }, []);

  const stopPet = useCallback(async () => {
    const running = await PartnerLibrary.stopPet();
    setPetRunning(running);
  }, []);

  return {
    pets,
    activeId,
    petRunning,
    setActive,
    installFromFolder,
    installFromJson,
    remove,
    exportPet,
    importModel,
    importModelFolder,
    startPet,
    stopPet,
    ready
  };
}
