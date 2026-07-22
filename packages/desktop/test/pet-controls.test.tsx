import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PetControls } from '../src/renderer/pages/Settings/companion/PetControls';
import { CompanionSettings } from '../src/renderer/pages/Settings/companion/CompanionSettings';

describe('Pet controls UI', () => {
  it('renders the start/stop control with running status', () => {
    const html = renderToString(<PetControls />);
    expect(html).toContain('data-testid="pet-controls"');
    expect(html).toContain('data-testid="pet-status"');
    expect(html).toContain('Desktop Pet');
    expect(html).toContain('One 3D model at a time');
  });

  it('shows the active character name when provided', () => {
    const html = renderToString(
      <PetControls activePet={{ name: 'Lily', id: 'lily', schema: 'superagent-partner', kind: 'girl', version: '1.0.0', description: 'x', reactions: {} } as any} />
    );
    expect(html).toContain('Lily');
  });

  it('renders the redesigned Companion settings page', () => {
    const html = renderToString(<CompanionSettings />);
    expect(html).toContain('data-testid="companion-settings"');
    expect(html).toContain('Companion');
    expect(html).toContain('How she behaves');
    expect(html).toContain('Ctrl+Q');
  });
});
