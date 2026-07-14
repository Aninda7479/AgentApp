import type { PartnerManifest } from './types';

/**
 * Built-in Partners that ship with the app. These are always available even
 * before anyone imports or creates one, and they double as copy-paste starting
 * points for the creator. See docs\Partner-Pet.md.
 */
export const DEFAULT_PARTNERS: PartnerManifest[] = [
  {
    schema: 'superagent-partner',
    id: 'lily',
    name: 'Lily',
    kind: 'girl',
    version: '1.0.0',
    description: 'A cute anime companion who works, sleeps, and keeps you company.',
    author: 'SuperAgent',
    accent: '#ff8fb3',
    emoji: '🧍',
    model: 'lily', // Uses the custom Lily 3D model
    laptop: true,
    pillow: true,
    reactions: {
      idle:      { emoji: '🧍', line: 'Ready when you are.' },
      thinking:  { emoji: '🤔', line: 'Hmm, let me think…' },
      working:   { emoji: '💻', line: 'On it!' },
      happy:     { emoji: '🙂', line: 'Nice.' },
      celebrate: { emoji: '🎉', line: 'Done!' },
      sad:       { emoji: '😢', line: 'That didn\'t go well.' },
      sleeping:  { emoji: '😴', line: 'zzz' }
    }
  }
];
