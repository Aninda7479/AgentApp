import type { VRM, VRMExpressionPresetName } from '@pixiv/three-vrm';
import type { CompanionMood } from './types';

export const MOOD_EXPRESSIONS: Record<CompanionMood, Partial<Record<VRMExpressionPresetName, number>>> = {
  idle:      { neutral: 1.0 },
  happy:     { happy: 0.95, relaxed: 0.3 },
  celebrate: { happy: 1.0, relaxed: 0.5 },
  thinking:  { neutral: 0.6, lookUp: 0.35 },
  working:   { neutral: 0.8 },
  sad:       { sad: 0.85 },
  angry:     { angry: 0.7 },
  surprised: { surprised: 0.95 },
  flirty:    { happy: 0.8, relaxed: 0.5 },
  sleepy:    { relaxed: 0.9, lookDown: 0.35 },
};

const ALL_PRESETS: VRMExpressionPresetName[] = [
  'happy',
  'sad',
  'angry',
  'surprised',
  'relaxed',
  'neutral',
  'lookUp',
  'lookDown',
];

/**
 * Reset and apply mood-based expression weights to a VRM instance.
 */
export function applyMoodExpressions(vrm: VRM | null, mood: CompanionMood): void {
  if (!vrm?.expressionManager) return;

  for (const preset of ALL_PRESETS) {
    vrm.expressionManager.setValue(preset, 0);
  }

  const exp = MOOD_EXPRESSIONS[mood] || MOOD_EXPRESSIONS.idle;
  for (const [k, v] of Object.entries(exp)) {
    if (typeof v === 'number') {
      vrm.expressionManager.setValue(k as VRMExpressionPresetName, v);
    }
  }
}
