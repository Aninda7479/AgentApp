import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { PartnerView } from '../src/renderer/components/partner/PartnerView';
import { PartnerOverlay } from '../src/renderer/components/partner/PartnerOverlay';
import { PartnerCreator } from '../src/renderer/components/partner/PartnerCreator';
import { PetSprite } from '../src/renderer/components/partner/PetSprite';
import { DEFAULT_PARTNERS } from '../src/renderer/components/partner/defaultPartners';
import {
  validatePartnerManifest,
  normalizeManifest,
  moodReaction,
  type PartnerManifest
} from '../src/renderer/components/partner/types';
import { mergePets } from '../src/renderer/components/partner/library';

const CUSTOM: PartnerManifest = {
  schema: 'superagent-partner',
  id: 'mochi',
  name: 'Mochi',
  kind: 'mochi',
  version: '1.2.0',
  description: 'A round rice-cake spirit.',
  author: '@tester',
  accent: '#34d399',
  emoji: '🍡',
  reactions: {
    idle: { emoji: '🍡', line: 'Mmm.', animation: 'float' },
    celebrate: { emoji: '🎊', line: 'Yay!', animation: 'wiggle' }
  }
};

describe('Partner manifest schema', () => {
  it('accepts a valid manifest', () => {
    const res = validatePartnerManifest(CUSTOM);
    expect(res.ok).toBe(true);
  });

  it('rejects a manifest without the schema tag', () => {
    const res = validatePartnerManifest({ id: 'x', name: 'X', kind: 'cat', description: 'd' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/schema/);
  });

  it('rejects an invalid id', () => {
    const res = validatePartnerManifest({
      schema: 'superagent-partner',
      id: 'bad id!',
      name: 'X',
      kind: 'cat',
      description: 'd'
    });
    expect(res.ok).toBe(false);
  });

  it('rejects an unknown mood in reactions', () => {
    const res = validatePartnerManifest({
      schema: 'superagent-partner',
      id: 'x',
      name: 'X',
      kind: 'cat',
      description: 'd',
      reactions: { angry: { line: 'grr' } }
    });
    expect(res.ok).toBe(false);
  });

  it('fills defaults via normalizeManifest', () => {
    const m = normalizeManifest({ schema: 'superagent-partner', id: 'z', name: 'Z', kind: 'cat', description: 'd' });
    expect(m.version).toBe('1.0.0');
    expect(m.emoji).toBe('🐾');
    expect(m.accent).toBe('#7c83ff');
    expect(m.reactions.idle).toBeDefined();
  });

  it('falls back to idle then default emoji for an undefined mood', () => {
    const m = normalizeManifest({ schema: 'superagent-partner', id: 'z', name: 'Z', kind: 'cat', description: 'd', emoji: '🦊' });
    expect(moodReaction(m, 'sad').emoji).toBeUndefined();
    expect(moodReaction(m, 'idle').emoji).toBeUndefined();
  });
});

describe('Partner library merge', () => {
  it('keeps defaults and de-duplicates by id (installed wins)', () => {
    const edited = { ...DEFAULT_PARTNERS[0], description: 'edited' };
    const merged = mergePets(DEFAULT_PARTNERS, [edited, CUSTOM]);
    const ids = merged.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(merged.find((p) => p.id === DEFAULT_PARTNERS[0].id)?.description).toBe('edited');
    expect(merged.find((p) => p.id === 'mochi')).toBeDefined();
  });
});

describe('PartnerView (gallery)', () => {
  const noop = () => {};

  it('renders built-in and custom partners with controls', () => {
    const html = renderToString(
      React.createElement(PartnerView, {
        pets: [DEFAULT_PARTNERS[0], CUSTOM],
        activeId: DEFAULT_PARTNERS[0].id,
        onSetActive: noop,
        onInstallFromFolder: noop,
        onInstallFromJson: noop,
        onRemove: noop,
        onExport: noop
      })
    );
    expect(html).toContain('Partner');
    expect(html).toContain(DEFAULT_PARTNERS[0].name);
    expect(html).toContain(CUSTOM.name);
    // Active badge for the default, Set active for the custom one.
    expect(html).toContain('Active');
    expect(html).toContain(`data-testid="partner-set-active-${CUSTOM.id}"`);
  });

  it('hides remove for built-ins but shows it for custom pets', () => {
    const html = renderToString(
      React.createElement(PartnerView, {
        pets: [DEFAULT_PARTNERS[0], CUSTOM],
        activeId: null,
        onSetActive: noop,
        onInstallFromFolder: noop,
        onInstallFromJson: noop,
        onRemove: noop,
        onExport: noop
      })
    );
    expect(html).not.toContain(`data-testid="partner-remove-${DEFAULT_PARTNERS[0].id}"`);
    expect(html).toContain(`data-testid="partner-remove-${CUSTOM.id}"`);
  });
});

describe('PartnerOverlay (floating companion)', () => {
  it('renders the active Partner with a mood when visible', () => {
    const html = renderToString(
      React.createElement(PartnerOverlay, {
        manifest: CUSTOM,
        visible: true,
        isGenerating: false,
        lastError: null
      })
    );
    expect(html).toContain('data-testid="partner-overlay"');
    expect(html).toContain(CUSTOM.name);
    expect(html).toContain('Mmm.');
  });

  it('shows a reopen pill when hidden', () => {
    const html = renderToString(
      React.createElement(PartnerOverlay, { manifest: CUSTOM, visible: false })
    );
    expect(html).toContain('data-testid="partner-reopen"');
  });

  it('renders the working mood while the agent is generating', () => {
    const html = renderToString(
      React.createElement(PartnerOverlay, {
        manifest: CUSTOM,
        visible: true,
        isGenerating: true,
        lastError: null
      })
    );
    expect(html).toContain('data-mood="working"');
  });

  it('renders the sad mood when there is a last error', () => {
    const html = renderToString(
      React.createElement(PartnerOverlay, {
        manifest: CUSTOM,
        visible: true,
        isGenerating: false,
        lastError: 'boom'
      })
    );
    expect(html).toContain('data-mood="sad"');
  });

  it('renders nothing when there is no Partner', () => {
    const html = renderToString(React.createElement(PartnerOverlay, { manifest: null, visible: true }));
    expect(html).toBe('');
  });
});

describe('PetSprite + PartnerCreator', () => {
  it('renders the mood emoji from the manifest', () => {
    const html = renderToString(React.createElement(PetSprite, { manifest: CUSTOM, mood: 'idle' }));
    expect(html).toContain('🍡');
    expect(html).toContain('data-testid="partner-sprite"');
  });

  it('renders the creator editor with identity + reaction fields', () => {
    const html = renderToString(
      React.createElement(PartnerCreator, { isOpen: true, onClose: () => {}, onSave: () => {} })
    );
    expect(html).toContain('data-testid="partner-creator"');
    expect(html).toContain('data-testid="creator-name"');
    expect(html).toContain('data-testid="creator-save"');
    expect(html).toContain('data-testid="creator-emoji-celebrate"');
  });
});

describe('3D Lily Partner fields', () => {
  const LILY = {
    schema: 'superagent-partner',
    id: 'lily',
    name: 'Lily',
    kind: 'girl',
    version: '1.0.0',
    description: 'A cute anime companion.',
    author: '@tester',
    accent: '#ff8fb3',
    vrm: 'character.vrm',
    laptop: true,
    pillow: true,
    dialogues: { working: 'Typing away…', celebrate: 'Yay! 🎉' },
    reactions: {
      idle: { emoji: '🧍', line: 'Ready.' },
      celebrate: { emoji: '🎉', line: 'Done!' }
    }
  } as const;

  it('validates a manifest that references a VRM character', () => {
    const res = validatePartnerManifest(LILY);
    expect(res.ok).toBe(true);
  });

  it('normalizes vrm / laptop / pillow / dialogues into the manifest', () => {
    const m = normalizeManifest(LILY as unknown as Record<string, unknown>);
    expect(m.vrm).toBe('character.vrm');
    expect(m.laptop).toBe(true);
    expect(m.pillow).toBe(true);
    expect(m.dialogues?.working).toBe('Typing away…');
  });

  it('defaults laptop/pillow to true when omitted', () => {
    const m = normalizeManifest(CUSTOM as unknown as Record<string, unknown>);
    expect(m.laptop).toBe(true);
    expect(m.pillow).toBe(true);
  });
});
