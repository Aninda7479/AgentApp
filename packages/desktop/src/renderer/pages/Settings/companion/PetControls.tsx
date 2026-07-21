import React, { useEffect, useState } from 'react';
import { Play, Square, PawPrint } from 'lucide-react';
import type { PartnerManifest } from '../../../partner-popup/types';
import { getIpc } from '../../../lib/electron';

/** Lazily resolves the Electron ipcRenderer. */
export interface PetControlsProps {
  /** The currently active Partner (used for the preview + label). */
  activePet?: PartnerManifest | null;
}

/**
 * Start / Stop control for the single 3D desktop pet. Self-contained: it tracks
 * the pet's running state over IPC, so it can be dropped onto the Partner page
 * or the Settings → Pets page without prop plumbing.
 *
 * Rules enforced elsewhere (main process):
 *  • Only one 3D model may run at a time.
 *  • The pet never auto-starts — it must be launched here, manually.
 *  • Ctrl+Q closes the running pet.
 */
export const PetControls: React.FC<PetControlsProps> = ({ activePet }) => {
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const ipc = getIpc();
    if (!ipc) return;
    ipc('pet-status').then((r: any) => setRunning(!!r?.running)).catch(() => {});
    const onRunning = (_e: unknown, v: boolean) => setRunning(!!v);
    ipc('pet-running', onRunning);
    return () => ipc('pet-running', onRunning);
  }, []);

  const toggle = async () => {
    const ipc = getIpc();
    if (!ipc) return;
    const res = running
      ? await ipc('pet-stop')
      : await ipc('pet-start');
    setRunning(!!res?.running);
  };

  const isWeb = !getIpc();

  return (
    <div data-testid="pet-controls" className="ui-card flex flex-col gap-4 p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--brand-accent)]/12 text-2xl">
          <PawPrint className="w-6 h-6 text-[var(--brand-accent)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-outfit text-base font-semibold text-brand-textMain">Desktop Pet</h2>
            <span
              data-testid="pet-status"
              className={`ui-badge ${running ? 'constructive' : 'muted'}`}
            >
              {running ? '● Running' : '○ Stopped'}
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-5 text-brand-textMuted">
            {activePet
              ? `Active character: ${activePet.name}`
              : 'Set an active Partner to choose the character.'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {isWeb ? (
          <p className="text-xs text-brand-textMuted">
            The 3D pet is a desktop-only feature. Install the desktop app to use it.
          </p>
        ) : (
          <button
            data-testid="pet-toggle"
            onClick={toggle}
            className={running ? 'ui-btn-ghost text-[color:var(--neon-destructive)]' : 'ui-btn-primary'}
          >
            {running ? <><Square size={15} /> Stop (Ctrl+Q)</> : <><Play size={15} /> Start pet</>}
          </button>
        )}
        <span className="text-[11px] text-brand-textMuted">
          One 3D model at a time · Ctrl+Q to close
        </span>
      </div>
    </div>
  );
};
