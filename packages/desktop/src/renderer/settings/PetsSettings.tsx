import React, { useEffect, useState } from 'react';
import { PawPrint, Keyboard, User, Sparkles } from 'lucide-react';
import { PetControls } from '../components/partner/PetControls';

/** Lazily resolves the Electron ipcRenderer. */
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
 * Settings → Pets. The real home for the 3D desktop companion: launch/stop
 * control plus a quick reference for its behaviors and interaction rules.
 */
export const PetsSettings: React.FC = () => {
  const [activeName, setActiveName] = useState<string | null>(null);

  useEffect(() => {
    const ipc = getIpc();
    if (!ipc) return;
    (async () => {
      try {
        const id: string | null = await ipc.invoke('partner-get-active');
        if (!id) return setActiveName(null);
        const all: any[] = await ipc.invoke('partner-list');
        setActiveName(all.find((p) => p.id === id)?.name ?? id);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  return (
    <div data-testid="pets-settings" className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-outfit text-lg font-semibold text-brand-textMain">Companion (Desktop Pet)</h1>
        <p className="mt-1 text-sm text-brand-textMuted">
          A 3D character that greets you, then rests in the top-right corner and
          reacts to your agent. It never starts on its own — launch it below.
        </p>
      </div>

      <PetControls activePet={activeName ? { name: activeName } as any : null} />

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
    </div>
  );
};
