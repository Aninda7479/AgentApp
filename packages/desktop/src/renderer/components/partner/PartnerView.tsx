import React, { useState } from 'react';
import { Plus, FolderOpen, Check, Trash2, Download, PawPrint, BookOpen } from 'lucide-react';
import { PetSprite } from './PetSprite';
import { PartnerCreator } from './PartnerCreator';
import { PetControls } from './PetControls';
import { DEFAULT_PARTNERS } from './defaultPartners';
import type { PartnerManifest } from './types';

export interface PartnerViewProps {
  pets: PartnerManifest[];
  activeId: string | null;
  /** Whether the 3D desktop pet is currently running. */
  petRunning: boolean;
  onSetActive: (id: string) => void;
  /** Opens the OS folder picker to import a Partner folder. */
  onInstallFromFolder: () => void;
  /** Installs a Partner from pasted/edited manifest JSON. */
  onInstallFromJson: (json: string) => void | Promise<void>;
  onRemove: (id: string) => void;
  onExport: (id: string) => void;
  /** Imports a 3D model file (.vrm/.glb/.gltf) and attaches it to a Partner. */
  onImportModel?: (id: string, filePath: string) => Promise<string | null> | void;
}

const BUILTIN_IDS = new Set(DEFAULT_PARTNERS.map((p) => p.id));

function openDocs(): void {
  const url = 'https://github.com/Aninda7479/AgentApp/blob/main/docs\Partner-Pet.md';
  try {
    const req = (window as any).require;
    if (req) {
      req('electron').ipcRenderer.invoke('open-external', url).catch(() => {});
      return;
    }
  } catch {
    /* fall through */
  }
  window.open(url, '_blank', 'noopener');
}

/**
 * Picks a 3D model file. Uses the native Electron dialog when available; in the
 * web build it falls back to an <input type="file"> filtered to model types.
 * Returns the chosen path/object URL, or null if cancelled.
 */
async function windowPickModelFile(): Promise<string | null> {
  const req = (window as any).require;
  if (req) {
    try {
      const ipc = req('electron').ipcRenderer;
      const res = await ipc.invoke('partner-pick-model-file');
      if (typeof res === 'string') return res;
    } catch {
      /* fall through to web fallback */
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vrm,.glb,.gltf,model/gltf-binary,model/gltf+json';
    input.onchange = () => {
      const f = input.files && input.files[0];
      resolve(f ? (window as any).URL?.createObjectURL?.(f) ?? null : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * The Partner gallery: browse the installed/open Partners, set the active one,
 * import a folder, create your own, and export or remove.
 */
export const PartnerView: React.FC<PartnerViewProps> = ({
  pets,
  activeId,
  petRunning,
  onSetActive,
  onInstallFromFolder,
  onInstallFromJson,
  onRemove,
  onExport,
  onImportModel
}) => {
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerManifest | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const openCreate = () => {
    setEditing(null);
    setCreatorOpen(true);
  };

  const openEdit = (pet: PartnerManifest) => {
    setEditing(pet);
    setCreatorOpen(true);
  };

  const handleSave = (json: string) => {
    onInstallFromJson(json);
    setCreatorOpen(false);
    flash('Partner saved to your library.');
  };

  return (
    <div data-testid="partner-view" className="flex h-full min-h-0 w-full flex-col bg-brand-bg text-brand-textMain">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-bg text-xl">
            <PawPrint className="w-5 h-5 text-brand-textMain" />
          </div>
          <div>
            <h1 className="font-outfit text-xl font-semibold tracking-tight text-brand-textMain sm:text-2xl">
              Partner <span className="text-brand-textMuted">/ Pet</span>
            </h1>
            <p className="text-xs text-brand-textMuted">
              An open companion that reacts to your agent. Build your own — anyone can.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="ui-btn" onClick={openDocs} title="How to make your own Partner">
            <BookOpen size={15} /> <span className="hidden sm:inline">Guide</span>
          </button>
          <button className="ui-btn" data-testid="partner-import-folder" onClick={onInstallFromFolder}>
            <FolderOpen size={15} /> <span className="hidden sm:inline">Import folder</span>
          </button>
          <button
            className="ui-btn"
            data-testid="partner-import-model"
            disabled={!activeId || !onImportModel}
            title={activeId ? 'Attach a 3D model to the active Partner' : 'Set an active Partner first'}
            onClick={async () => {
              if (!activeId || !onImportModel) return;
              const filePath = await windowPickModelFile();
              if (!filePath) return;
              const model = await onImportModel(activeId, filePath);
              if (model) {
                const name = pets.find((p) => p.id === activeId)?.name ?? 'Partner';
                flash(`Model attached to ${name}.`);
              } else {
                flash('Could not attach model (see console).');
              }
            }}
          >
            <Download size={15} /> <span className="hidden sm:inline">Import 3D model</span>
          </button>
          <button className="ui-btn-primary" data-testid="partner-create" onClick={openCreate}>
            <Plus size={15} /> <span>Create</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          {/* Manual launch control — the pet never auto-starts */}
          <PetControls
            activePet={pets.find((p) => p.id === activeId) || null}
          />

          <div className="ui-label">
            {pets.length} partner{pets.length === 1 ? '' : 's'} · {pets.filter((p) => p.id === activeId).length ? '1 active' : 'none active'}
          </div>

          {pets.length === 0 ? (
            <div className="ui-card px-6 py-10 text-center text-sm text-brand-textMuted">
              No Partners yet. Hit <span className="font-semibold">Create</span> to make your first one.
            </div>
          ) : (
            <div className="ui-grid-auto">
              {pets.map((pet) => {
                const isActive = pet.id === activeId;
                const isBuiltin = BUILTIN_IDS.has(pet.id);
                return (
                  <div
                    key={pet.id}
                    data-testid={`partner-card-${pet.id}`}
                    className={`ui-card flex flex-col gap-3 p-4 transition-all ${
                      isActive ? 'ring-1 ring-[color:var(--brand-accent-border)]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <PetSprite manifest={pet} mood={isActive ? 'happy' : 'idle'} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-brand-textMain">{pet.name}</span>
                          {isActive && (
                            <span className="ui-badge bg-emerald-500/12 text-emerald-400">
                              <Check size={10} /> Active
                            </span>
                          )}
                          {isActive && petRunning && (
                            <span className="ui-badge bg-[var(--brand-accent)]/12 text-[color:var(--brand-accent)]">
                              ● Live
                            </span>
                          )}
                        </div>
                        <div className="ui-eyebrow">{pet.kind}{pet.author ? ` · ${pet.author}` : ''}</div>
                      </div>
                    </div>

                    <p className="text-xs leading-relaxed text-brand-textMuted">{pet.description}</p>

                    {(pet.model || pet.vrm) && (
                      <div
                        data-testid={`partner-model-${pet.id}`}
                        className="ui-badge bg-[var(--brand-accent)]/12 text-[color:var(--brand-accent)]"
                        title="Imported 3D character model"
                      >
                        3D · {pet.vrm ? 'VRM' : 'GLB'}: {pet.model || pet.vrm}
                      </div>
                    )}

                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                      {isActive ? (
                        <span className="ui-btn flex-shrink-0 cursor-default opacity-70">Active</span>
                      ) : (
                        <button
                          data-testid={`partner-set-active-${pet.id}`}
                          className="ui-btn-primary flex-shrink-0"
                          onClick={() => onSetActive(pet.id)}
                        >
                          Set active
                        </button>
                      )}
                      <button
                        data-testid={`partner-edit-${pet.id}`}
                        className="ui-btn-ghost flex-shrink-0"
                        onClick={() => openEdit(pet)}
                      >
                        Edit
                      </button>
                      <button
                        data-testid={`partner-export-${pet.id}`}
                        className="ui-btn-ghost flex-shrink-0"
                        title="Export / reveal folder"
                        onClick={() => { onExport(pet.id); flash(`Exported ${pet.name}.`); }}
                      >
                        <Download size={14} />
                      </button>
                      {!isBuiltin && (
                        <button
                          data-testid={`partner-remove-${pet.id}`}
                          className="ui-btn-ghost flex-shrink-0 text-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/10"
                          title="Remove from library"
                          onClick={() => onRemove(pet.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="ui-popover fixed bottom-24 left-1/2 z-50 -translate-x-1/2 px-4 py-2 text-sm text-brand-textMain animate-fade-in">
          {toast}
        </div>
      )}

      <PartnerCreator
        isOpen={creatorOpen}
        initial={editing}
        onClose={() => setCreatorOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
};
