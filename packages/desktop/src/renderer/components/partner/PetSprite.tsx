import React from 'react';
import { moodReaction, type PartnerAnimation, type PartnerManifest, type PartnerMood } from './types';

const ANIM_CLASS: Record<PartnerAnimation, string> = {
  float: 'partner-anim-float',
  bounce: 'partner-anim-bounce',
  pulse: 'partner-anim-pulse',
  wiggle: 'partner-anim-wiggle',
  think: 'partner-anim-think',
  none: ''
};

export interface PetSpriteProps {
  manifest: PartnerManifest;
  mood: PartnerMood;
  /** Pixel size of the emoji glyph. Default 48. */
  size?: number;
  className?: string;
}

/**
 * Renders a Partner's current look: the mood's emoji (or default), wrapped in a
 * soft accent glow ring and playing the mood's CSS animation.
 */
export const PetSprite: React.FC<PetSpriteProps> = ({ manifest, mood, size = 48, className = '' }) => {
  const reaction = moodReaction(manifest, mood);
  const emoji = reaction.emoji ?? manifest.emoji ?? '🐾';
  const anim = reaction.animation ?? 'none';
  const accent = manifest.accent || '#7c83ff';

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
      <span
        className="select-none leading-none"
        style={{ fontSize: size, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))' }}
      >
        {emoji}
      </span>
    </div>
  );
};
