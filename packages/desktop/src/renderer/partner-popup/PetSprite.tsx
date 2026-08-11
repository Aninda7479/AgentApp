import React from 'react';
import { moodReaction, type PartnerAnimation, type PartnerManifest, type PartnerMood } from './types';
import { PetSprite3D } from './PetSprite3D';

const ANIM_CLASS: Record<PartnerAnimation, string> = {
  float: 'partner-anim-float',
  bounce: 'partner-anim-bounce',
  pulse: 'partner-anim-pulse',
  wiggle: 'partner-anim-wiggle',
  think: 'partner-anim-think',
  none: ''
};

/** Partners whose `model` field maps to a built-in 3D procedural character. */
const PROCEDURAL_MODELS = new Set(['lily']);

export interface PetSpriteProps {
  manifest: PartnerManifest;
  mood: PartnerMood;
  /** Pixel size of the sprite. Default 48. */
  size?: number;
  className?: string;
  cameraAngle?: 'close-up' | 'normal' | 'full';
  lipSync?: boolean;
  darkCircles?: boolean;
  onPoke?: (part: string) => void;
}

/**
 * Renders a Partner's current look.
 *
 * For partners with a known built-in 3D model (currently just "lily") this
 * delegates to <PetSprite3D> which runs a full Three.js WebGL canvas with the
 * procedural Lily character — animated, mood-reactive, and alive.
 *
 * All other partners fall back to the original 2D path:
 *   dpUrl image → emoji glyph
 * wrapped in the same soft accent glow ring.
 */
export const PetSprite: React.FC<PetSpriteProps> = ({
  manifest,
  mood,
  size = 48,
  className = '',
  cameraAngle,
  lipSync,
  darkCircles,
  onPoke
}) => {
  const accent = manifest.accent || '#7c83ff';

  // ── 3D path ──────────────────────────────────────────────────────────────────
  if (manifest.model && PROCEDURAL_MODELS.has(manifest.model)) {
    return (
      <div
        data-testid="partner-sprite"
        data-mood={mood}
        className={`relative flex items-center justify-center rounded-2xl ${className}`}
        style={{
          width: size,
          height: size,
          boxShadow: `0 0 28px color-mix(in srgb, ${accent} 35%, transparent), inset 0 0 0 1px color-mix(in srgb, ${accent} 30%, transparent)`
        }}
        aria-label={`${manifest.name} (${mood})`}
      >
        <PetSprite3D
          manifest={manifest}
          mood={mood}
          size={size}
          className="w-full h-full"
          cameraAngle={cameraAngle}
          lipSync={lipSync}
          darkCircles={darkCircles}
          onPoke={onPoke}
        />
      </div>
    );
  }

  // ── 2D path (original behaviour) ─────────────────────────────────────────────
  const reaction = moodReaction(manifest, mood);
  const emoji = reaction.emoji ?? manifest.emoji ?? '🐾';
  const anim = reaction.animation ?? 'none';

  return (
    <div
      data-testid="partner-sprite"
      data-mood={mood}
      className={`relative flex items-center justify-center rounded-full ${ANIM_CLASS[anim]} ${className}`}
      style={{
        width: size + 24,
        height: size + 24,
        background: `radial-gradient(circle at 50% 40%, color-mix(in srgb, ${accent} 26%, transparent), transparent 70%)`,
        boxShadow: `0 0 22px color-mix(in srgb, ${accent} 30%, transparent), inset 0 0 0 1px color-mix(in srgb, ${accent} 40%, transparent)`
      }}
      aria-label={`${manifest.name} (${mood})`}
    >
      {manifest.dpUrl ? (
        <img
          src={manifest.dpUrl}
          alt={manifest.name}
          className="rounded-full object-cover select-none pointer-events-none"
          style={{
            width: size,
            height: size,
            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))'
          }}
        />
      ) : (
        <span
          className="select-none leading-none"
          style={{ fontSize: size, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))' }}
        >
          {emoji}
        </span>
      )}
    </div>
  );
};
