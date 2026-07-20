import React, { useState } from 'react';
import { Plus, FolderOpen, Check, Trash2, Download, PawPrint, BookOpen, Keyboard, User, Sparkles } from 'lucide-react';
import { PetSprite } from '../../../partner-popup/PetSprite';
import { PartnerCreator } from './PartnerCreator';
import { PetControls } from './PetControls';
import { DEFAULT_PARTNERS } from './defaultPartners';
import { usePartners } from './library';
import type { PartnerManifest } from '../../../partner-popup/types';
import { getIpc, openExternalPath } from '../../../lib/electron';

function openDocs(): void {
  const url = 'https://github.com/Aninda7479/AgentApp/blob/main/docs/Partner-Pet.md';
  openExternalPath(url).catch(() => window.open(url, '_blank', 'noopener'));
}

/**
 * Picks a 3D model file. Uses the native Electron dialog when available; in the
 * web build it falls back to an <input type="file"> filtered to model types.
 * Returns the chosen path/object URL, or null if cancelled.
 */
async function windowPickModelFile(): Promise<string | null> {
  const ipc = getIpc();
  if (ipc) {
    try {
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
 * Picks a 3D model *folder*. Uses the native Electron folder dialog when
 * available; in the web build it falls back to an `<input webkitdirectory>`
 * (folder) selection and returns the chosen folder path/object URL, or null.
 */
async function windowPickModelFolder(): Promise<string | null> {
  const ipc = getIpc();
  if (ipc) {
    try {
      const res = await ipc.invoke('partner-pick-model-folder');
      if (typeof res === 'string') return res;
    } catch {
      /* fall through to web fallback */
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // `webkitdirectory` makes the input select a folder instead of a file.
    (input as any).webkitdirectory = true;
    (input as any).directory = true;
    input.onchange = () => {
      const f = input.files && input.files[0];
      resolve(f ? (window as any).URL?.createObjectURL?.(f) ?? null : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

interface BehaviorRow {
  icon: string;
  state: string;
  trigger: string;
}

const BEHAVIORS: BehaviorRow[] = [
  { icon: '💻', state: 'Working', trigger: 'agent is streaming / running a tool' },
  { icon: '🪑', state: 'Idle', trigger: 'AI idle, first 10 min' },
  { icon: '😴', state: 'Sleeping', trigger: 'idle for more than 10 min' },
  { icon: '🥺', state: 'Laying lonely', trigger: 'idle for more than 30 min' },
  { icon: '🚶', state: 'Walk / jump', trigger: 'right-click + drag her' },
  { icon: '👆', state: 'Poke', trigger: 'left-click a body part' },
  { icon: '🥱', state: 'Dark circles', trigger: 'context window ≥ 90% used' },
  { icon: '💬', state: 'Talking', trigger: 'agent needs input (she speaks + sounds)' },
  { icon: '🎉', state: 'Celebrate', trigger: 'agent run finished' },
  { icon: '😢', state: 'Sad', trigger: 'agent errored / aborted' }
];

/**
 * Single home for the Companion (Desktop Pet) + open Partner ecosystem.
 * Merges the former Settings → Pets page (launch control + behavior reference)
 * with the former Workspace → Partner gallery (create / import / set active /
 * attach a 3D model). Reached from the Settings sidebar ("Companion") and from
 * the Workspace sidebar's "Companion" entry.
 */
export const CompanionSettings: React.FC = () => {
  const partners = usePartners();
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
    partners.installFromJson(json);
    setCreatorOpen(false);
    flash('Partner saved to your library.');
  };

  const pets = partners.pets;
  const activeId = partners.activeId;
  const petRunning = partners.petRunning;

  return (
    <div data-testid="companion-settings" className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-bg text-xl">
            <PawPrint className="w-5 h-5 text-brand-textMain" />
          </div>
          <div>
            <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
              Companion <span className="text-brand-textMuted">/ Partner &amp; Pet</span>
            </h1>
            <p className="text-xs text-brand-textMuted">
              A 3D character that greets you and reacts to your agent, plus an open
              ecosystem of Partners you can build yourself.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="ui-btn" onClick={openDocs} title="How to make your own Partner">
            <BookOpen size={15} /> <span className="hidden sm:inline">Guide</span>
          </button>
          <button className="ui-btn" data-testid="partner-import-folder" onClick={() => partners.installFromFolder()}>
            <FolderOpen size={15} /> <span className="hidden sm:inline">Import folder</span>
          </button>
          <button
            className="ui-btn"
            data-testid="partner-import-model"
            disabled={!activeId || !partners.importModel}
            title={activeId ? 'Attach a 3D model file to the active Partner (legacy)' : 'Set an active Partner first'}
            onClick={async () => {
              if (!activeId || !partners.importModel) return;
              const filePath = await windowPickModelFile();
              if (!filePath) return;
              const model = await partners.importModel(activeId, filePath);
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
          <button
            className="ui-btn ui-btn-primary"
            data-testid="partner-import-model-folder"
            disabled={!activeId || !partners.importModelFolder}
            title={activeId ? 'Import a 3D model folder (index.ts exporting a Character) into the active Partner' : 'Set an active Partner first'}
            onClick={async () => {
              if (!activeId || !partners.importModelFolder) return;
              const folderPath = await windowPickModelFolder();
              if (!folderPath) return;
              const modelFolder = await partners.importModelFolder(activeId, folderPath);
              if (modelFolder) {
                const name = pets.find((p) => p.id === activeId)?.name ?? 'Partner';
                flash(`Model folder attached to ${name}.`);
              } else {
                flash('Could not attach model folder (see console).');
              }
            }}
          >
            <FolderOpen size={15} /> <span className="hidden sm:inline">Import 3D Model Folder</span>
          </button>
        </div>
      </div>

      {/* Launch control + behavior reference (formerly Settings → Pets) */}
      <PetControls activePet={pets.find((p) => p.id === activeId) || null} />

      <div className="ui-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--brand-accent)]" />
          <h2 className="text-sm font-semibold text-brand-textMain">How she behaves</h2>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {BEHAVIORS.map((b) => (
            <div key={b.state} className="flex items-start gap-2 text-xs">
              <span className="text-base leading-none">{b.icon}</span>
              <div>
                <span className="font-medium text-brand-textMain">{b.state}</span>
                <span className="text-brand-textMuted"> — {b.trigger}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ui-card flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-textMain">
          <Keyboard className="h-4 w-4 text-[var(--brand-accent)]" /> Interaction &amp; rules
        </div>
        <ul className="space-y-2 text-xs leading-5 text-brand-textMuted">
          <li className="flex items-start gap-2">
            <User className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span><b className="text-brand-textMain">Only one 3D model runs at a time.</b> Setting a different active Partner swaps the character in the same window.</span>
          </li>
          <li className="flex items-start gap-2">
            <Keyboard className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span><b className="text-brand-textMain">Ctrl+Q</b> closes the pet. It stays off until you start it again.</span>
          </li>
          <li className="flex items-start gap-2">
            <PawPrint className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>Resize her with the bottom-right grip (down to a small pet, up to full screen).</span>
          </li>
        </ul>
      </div>

      {/* Partner gallery (formerly Workspace → Partner) */}
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="ui-label">
            {pets.length} partner{pets.length === 1 ? '' : 's'} · {pets.filter((p) => p.id === activeId).length ? '1 active' : 'none active'}
          </div>
          <button className="ui-btn ui-btn-primary" onClick={openCreate}>
            <Plus size={15} /> <span className="hidden sm:inline">Create Partner</span>
          </button>
        </div>

        {pets.length === 0 ? (
          <div className="ui-card px-6 py-10 text-center text-sm text-brand-textMuted">
            No Partners yet. Hit <span className="font-semibold">Create</span> to make your first one.
          </div>
        ) : (
          <div className="ui-grid-auto">
            {pets.map((pet) => {
              const isActive = pet.id === activeId;
              const isBuiltin = DEFAULT_PARTNERS.some((p) => p.id === pet.id);
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
                          <span className="ui-badge constructive">
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

                  {(pet.model || pet.vrm || pet.modelFolder) && (
                    <div
                      data-testid={`partner-model-${pet.id}`}
                      className="ui-badge bg-[var(--brand-accent)]/12 text-[color:var(--brand-accent)]"
                      title="Imported 3D character model"
                    >
                      3D · {pet.modelFolder ? `Folder: ${pet.modelFolder}` : pet.vrm ? 'VRM' : 'GLB'}: {pet.model || pet.vrm || ''}
                    </div>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    {isActive ? (
                      <span className="ui-btn flex-shrink-0 cursor-default opacity-70">Active</span>
                    ) : (
                      <button
                        data-testid={`partner-set-active-${pet.id}`}
                        className="ui-btn-primary flex-shrink-0"
                        onClick={() => partners.setActive(pet.id)}
                      >
                        Set active
                      </button>
                    )}
                    {!isBuiltin && (
                      <button
                        data-testid={`partner-remove-${pet.id}`}
                        className="ui-btn-ghost flex-shrink-0 text-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/10"
                        title="Remove from library"
                        onClick={() => partners.remove(pet.id)}
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

export default CompanionSettings;
