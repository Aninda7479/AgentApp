import React, { useEffect, useRef, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { PetSprite } from './PetSprite';
import { moodReaction, type PartnerManifest, type PartnerMood } from './types';
import { getIpc } from '../lib/ipc';

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

/** Mood → status dot color */
const MOOD_COLOR: Record<PartnerMood, string> = {
  idle:      '#94a3b8',  // slate
  thinking:  '#60a5fa',  // blue
  working:   '#34d399',  // green
  happy:     '#facc15',  // yellow
  celebrate: '#f59e0b',  // amber
  sad:       '#f87171',  // red
  sleeping:  '#818cf8',  // indigo
};

/** Mood → human-readable status label */
const MOOD_LABEL: Record<PartnerMood, string> = {
  idle:      'Ready',
  thinking:  'Thinking…',
  working:   'Working',
  happy:     'Happy',
  celebrate: 'Done!',
  sad:       'Error',
  sleeping:  'Resting',
};

/** Partners that have a real built-in 3D model (use larger card). */
const HAS_3D_MODEL = new Set(['lily']);

/**
 * Floating desktop companion. Sits in the bottom-right corner, reacts to
 * agent events (thinking / working / celebrate / sad), and is draggable.
 *
 * When the active partner has a 3D model (e.g. Lily) the card expands
 * vertically to give the Three.js canvas room to breathe: the model floats
 * above a name + mood row, all wrapped in an accent-glowing glass panel.
 */
export const PartnerOverlay: React.FC<PartnerOverlayProps> = ({
  manifest,
  visible = true,
  isGenerating = false,
  lastError = null,
  onToggle
}) => {
  // Mood derived from props, with a transient live override set by real agent events.
  const [liveMood, setLiveMood] = useState<PartnerMood | null>(null);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [offset, setOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [pulseKey, setPulseKey] = useState(0); // incremented on mood change to restart glow animation

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
      setPulseKey((k) => k + 1);
      if (revertTimer.current) clearTimeout(revertTimer.current);
      revertTimer.current = setTimeout(() => {
        revertTimer.current = null;
        setLiveMood(null);
      }, 3500);
    };
    ipc('agent-event', onEvent);
    return () => {
      ipc('agent-event', onEvent);
      if (revertTimer.current) clearTimeout(revertTimer.current);
    };
  }, []);

  const mood = liveMood ?? derived;

  if (!manifest) return null;

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

  const reaction    = moodReaction(manifest, mood);
  const accent      = manifest.accent || '#7c83ff';
  const moodColor   = MOOD_COLOR[mood] ?? '#94a3b8';
  const moodLabel   = MOOD_LABEL[mood] ?? mood;
  const is3D        = !!(manifest.model && HAS_3D_MODEL.has(manifest.model));

  // ── Drag handlers ──────────────────────────────────────────────────────────
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
  const onPointerUp = () => { dragRef.current = null; };

  // ── 3D card (vertical, large canvas) ──────────────────────────────────────
  if (is3D) {
    return (
      <div
        data-testid="partner-overlay"
        data-mood={mood}
        className="pointer-events-none fixed bottom-20 right-5 z-40 flex flex-col items-end gap-2 select-none"
        style={{ transform: `translate(${offset.dx}px, ${offset.dy}px)` }}
      >
        {/* Speech bubble */}
        {reaction.line && (
          <div
            data-testid="partner-bubble"
            className="glass-strong max-w-[190px] rounded-2xl rounded-br-sm px-3 py-2 text-xs leading-snug text-brand-textMain shadow-lg animate-fade-in"
          >
            {reaction.line}
          </div>
        )}

        {/* ── Main 3D card ── */}
        <div
          className="pointer-events-none flex flex-col items-center rounded-2xl overflow-hidden shadow-2xl"
          style={{
            width: 160,
            background: `linear-gradient(160deg,
              color-mix(in srgb, var(--brand-sidebar) 90%, ${accent} 10%) 0%,
              color-mix(in srgb, var(--brand-sidebar) 82%, transparent) 100%)`,
            backdropFilter: 'blur(24px) saturate(140%)',
            WebkitBackdropFilter: 'blur(24px) saturate(140%)',
            border: `1px solid color-mix(in srgb, ${accent} 35%, transparent)`,
            boxShadow: `
              0 0 0 1px color-mix(in srgb, ${accent} 20%, transparent),
              0 8px 32px color-mix(in srgb, ${accent} 18%, rgba(0,0,0,0.4)),
              inset 0 1px 0 color-mix(in srgb, ${accent} 25%, transparent)
            `
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          title={`${manifest.name} — drag to move`}
        >
          {/* 3D viewport — fills the top portion of the card */}
          <div
            className="pointer-events-auto cursor-grab active:cursor-grabbing w-full relative"
            style={{ height: 160 }}
          >
            {/* Subtle top inner glow that pulses on mood change */}
            <div
              key={pulseKey}
              className="pointer-events-none absolute inset-0 rounded-t-2xl"
              style={{
                background: `radial-gradient(ellipse at 50% 0%, color-mix(in srgb, ${accent} 22%, transparent) 0%, transparent 70%)`,
                animation: 'partner-glow-in 1.2s ease-out forwards'
              }}
            />
            <PetSprite
              manifest={manifest}
              mood={mood}
              size={160}
              className="w-full h-full"
            />
          </div>

          {/* ── Info row ── */}
          <div
            className="pointer-events-none w-full flex items-center justify-between gap-1 px-3 py-2"
            style={{
              borderTop: `1px solid color-mix(in srgb, ${accent} 20%, transparent)`
            }}
          >
            {/* Name + mood */}
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-brand-textMain leading-tight truncate">
                {manifest.name}
              </div>
              <div className="flex items-center gap-1 mt-[2px]">
                {/* Mood dot */}
                <span
                  className="inline-block rounded-full flex-shrink-0"
                  style={{
                    width: 6,
                    height: 6,
                    background: moodColor,
                    boxShadow: `0 0 5px ${moodColor}`
                  }}
                />
                <span
                  className="text-[10px] leading-none truncate"
                  style={{ color: moodColor }}
                >
                  {moodLabel}
                </span>
              </div>
            </div>

            {/* Hide button */}
            <button
              data-testid="partner-hide"
              onClick={onToggle}
              title="Hide Partner"
              className="pointer-events-auto flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-brand-textMuted hover:bg-[var(--brand-hover-strong)] hover:text-brand-textMain transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 2D card (original horizontal pill) ────────────────────────────────────
  return (
    <div
      data-testid="partner-overlay"
      data-mood={mood}
      className="pointer-events-none fixed top-1/2 right-5 z-40 flex flex-col items-end gap-2 select-none"
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
        className="pointer-events-none glass-panel flex items-center gap-3 rounded-2xl px-3 py-2 shadow-lg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ borderColor: `color-mix(in srgb, ${accent} 40%, transparent)` }}
        title={`${manifest.name} — drag to move`}
      >
        <span className="pointer-events-auto cursor-grab active:cursor-grabbing">
          <PetSprite manifest={manifest} mood={mood} size={40} />
        </span>
        <div className="pointer-events-none pr-1">
          <div className="text-[13px] font-semibold text-brand-textMain leading-tight">{manifest.name}</div>
          <div className="ui-eyebrow">{manifest.kind}</div>
        </div>
        <button
          data-testid="partner-hide"
          onClick={onToggle}
          title="Hide Partner"
          className="pointer-events-auto ml-1 flex h-6 w-6 items-center justify-center rounded-md text-brand-textMuted hover:bg-[var(--brand-hover-strong)] hover:text-brand-textMain transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
