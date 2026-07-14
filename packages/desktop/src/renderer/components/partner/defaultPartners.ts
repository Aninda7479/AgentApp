import type { PartnerManifest } from './types';

/**
 * Built-in Partners that ship with the app. These are always available even
 * before anyone imports or creates one, and they double as copy-paste starting
 * points for the creator. See docs\Partner-Pet.md.
 */
export const DEFAULT_PARTNERS: PartnerManifest[] = [
  {
    schema: 'superagent-partner',
    id: 'pixel',
    name: 'Pixel',
    kind: 'cat',
    version: '1.0.0',
    description: 'A calm tabby who naps while you think and purrs on success.',
    author: 'SuperAgent',
    accent: '#7c83ff',
    emoji: '🐱',
    personality: { voice: 'soft and encouraging', traits: ['calm', 'curious'] },
    reactions: {
      idle: { emoji: '🐱', line: 'Ready when you are.', animation: 'float' },
      thinking: { emoji: '🐱', line: 'Hmm, let me watch…', animation: 'think' },
      working: { emoji: '🐈', line: 'On it!', animation: 'bounce' },
      happy: { emoji: '😺', line: 'Nice.', animation: 'bounce' },
      celebrate: { emoji: '😻', line: 'We did it!', animation: 'wiggle' },
      sad: { emoji: '🙀', line: 'That hurt a bit.', animation: 'none' },
      sleeping: { emoji: '😴', line: 'zzz', animation: 'pulse' }
    }
  },
  {
    schema: 'superagent-partner',
    id: 'byte',
    name: 'Byte',
    kind: 'robot',
    version: '1.0.0',
    description: 'A tireless little robot that loves running tools.',
    author: 'SuperAgent',
    accent: '#38bdf8',
    emoji: '🤖',
    personality: { voice: 'precise and upbeat', traits: ['diligent', 'playful'] },
    reactions: {
      idle: { emoji: '🤖', line: 'Systems nominal.', animation: 'float' },
      thinking: { emoji: '🤖', line: 'Computing…', animation: 'think' },
      working: { emoji: '⚙️', line: 'Executing tool.', animation: 'bounce' },
      happy: { emoji: '🦾', line: 'Task complete.', animation: 'bounce' },
      celebrate: { emoji: '🎉', line: 'Success logged!', animation: 'wiggle' },
      sad: { emoji: '💥', line: 'Fault detected.', animation: 'none' },
      sleeping: { emoji: '🔌', line: 'Standing by.', animation: 'pulse' }
    }
  },
  {
    schema: 'superagent-partner',
    id: 'nova',
    name: 'Nova',
    kind: 'star',
    version: '1.0.0',
    description: 'A bright star that twinkles while the agent works.',
    author: 'SuperAgent',
    accent: '#fbbf24',
    emoji: '⭐',
    personality: { voice: 'warm and cheerful', traits: ['optimistic', 'energetic'] },
    reactions: {
      idle: { emoji: '⭐', line: 'Shining and ready.', animation: 'float' },
      thinking: { emoji: '🌟', line: 'Sparking ideas…', animation: 'think' },
      working: { emoji: '💫', line: 'Twinkling away!', animation: 'bounce' },
      happy: { emoji: '✨', line: 'Lovely.', animation: 'bounce' },
      celebrate: { emoji: '🌠', line: 'Magic happened!', animation: 'wiggle' },
      sad: { emoji: '🌑', line: 'Clouded over.', animation: 'none' },
      sleeping: { emoji: '🌙', line: 'Resting in orbit.', animation: 'pulse' }
    }
  }
];
