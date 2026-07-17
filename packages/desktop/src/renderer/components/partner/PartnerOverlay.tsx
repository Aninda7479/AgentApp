import React, { useEffect, useRef, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { PetSprite } from './PetSprite';
import { moodReaction, type PartnerManifest, type PartnerMood } from './types';

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

export interface PartnerOverlayProps {
  /** The active Partner to display, or null to hide the creature. */
  manifest: PartnerManifest | null;
  /** Whether the overlay creature is shown at all. */
  visible?: boolean;
  /** True while the agent is running (drives the "working" mood in demo mode). */
  isGenerating?: boolean;
  /** Last agent error; drives the "sad" mood. */
  lastError?: string | null;
  /** Toggles visibility (hide / reopen). */
  onToggle?: () => void;
}

/**
 * Floating desktop companion. Sits in the bottom-right corner, reacts to agent
 * events (thinking / working / celebrate / sad), and is draggable. This is the
 * "Pet" surface — your Partner keeps you company while the agent works.
 */
export const PartnerOverlay: React.FC<PartnerOverlayProps> = ({
  manifest,
  visible = true,
  isGenerating = false,
  lastError = null,
  onToggle
}) => {
  // Mood derived from props (used when there's no live event feed), with a
  // transient live override set by real agent events.
  const [liveMood, setLiveMood] = useState<PartnerMood | null>(null);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [offset, setOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const derived: PartnerMood = lastError ? 'sad' : isGenerating ? 'working' : 'idle';

  // Listen to real agent events for finer-grained moods (desktop only).
  useEffect(() => {
    const ipc = getIpc();
    if (!ipc) return;
    const onEvent = (_e: unknown, ev: { type?: string }) => {
      let next: PartnerMood | null = null;
      switch (ev?.type) {
        case 'token':
          next = 'thinking';
          break;
        case 'tool_call':
        case 'tool_result':
          next = 'working';
          break;
        case 'done':
          next = 'celebrate';
          break;
        case 'error':
        case 'abort':
          next = 'sad';
          break;
        default:
          next = null;
      }
      if (!next) return;
      setLiveMood(next);
      if (revertTimer.current) clearTimeout(revertTimer.current);
      revertTimer.current = setTimeout(() => {
        revertTimer.current = null;
        setLiveMood(null);
      }, 3500);
    };
    ipc.on('agent-event', onEvent);
    return () => {
      ipc.removeListener('agent-event', onEvent);
      if (revertTimer.current) clearTimeout(revertTimer.current);
    };
  }, []);

  const mood = liveMood ?? derived;

  if (!manifest) {
    return null;
  }

  // Reopen pill when hidden.
  if (!visible) {
    return (
      <button
        data-testid="partner-reopen"
        onClick={onToggle}
        title="Show your Partner"
        className="ui-btn-accent fixed bottom-24 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full !p-0 shadow-lg"
      >
        <Sparkles size={18} />
      </button>
    );
  }

  const reaction = moodReaction(manifest, mood);
  const accent = manifest.accent || '#7c83ff';

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = dragRef.current.x - e.clientX;
    const dy = dragRef.current.y - e.clientY;
    setOffset((o) => ({ dx: o.dx + dx, dy: o.dy + dy }));
    dragRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      data-testid="partner-overlay"
      data-mood={mood}
      className="pointer-events-none fixed bottom-24 right-5 z-40 flex flex-col items-end gap-2 select-none"
      style={{ transform: `translate(${offset.dx}px, ${offset.dy}px)` }}
    >
      {reaction.line && (
        <div
          data-testid="partner-bubble"
          className="glass-strong max-w-[200px] rounded-2xl rounded-br-sm px-3 py-2 text-xs leading-snug text-brand-textMain shadow-lg animate-fade-in"
        >
          {reaction.line}
        </div>
      )}
      <div
        className="pointer-events-auto glass-panel flex items-center gap-3 rounded-2xl px-3 py-2 shadow-lg cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ borderColor: `color-mix(in srgb, ${accent} 40%, transparent)` }}
        title={`${manifest.name} — drag to move`}
      >
        <PetSprite manifest={manifest} mood={mood} size={40} />
        <div className="pr-1">
          <div className="text-[13px] font-semibold text-brand-textMain leading-tight">{manifest.name}</div>
          <div className="ui-eyebrow">{manifest.kind}</div>
        </div>
        <button
          data-testid="partner-hide"
          onClick={onToggle}
          title="Hide Partner"
          className="ml-1 flex h-6 w-6 items-center justify-center rounded-md text-brand-textMuted hover:bg-white/10 hover:text-brand-textMain transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
