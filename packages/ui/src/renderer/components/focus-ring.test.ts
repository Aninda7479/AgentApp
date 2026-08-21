import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Regression guard for the global keyboard focus ring (a11y, 2026-07-16):
 * before this change only .ui-focus elements had a ring and .ui-input reset
 * outline to none with a near-invisible shadow, so toolbar/sidebar/composer
 * controls had effectively no visible focus (WCAG 2.4.7 / 2.4.11). We now ship a
 * global *:focus-visible rule plus a visible .ui-input:focus shadow. This test
 * asserts those rules exist in the source CSS so a regression can't silently
 * re-introduce outline:none-with-no-ring.
 */
const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf-8');

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

describe('global focus ring CSS', () => {
  const body = stripComments(css);

  it('defines a global *:focus-visible rule with a visible outline', () => {
    expect(body).toMatch(/\*:\s*focus-visible\s*\{[^}]*outline\s*:\s*2px solid/);
  });

  it('global focus ring uses the brand-accent token (high contrast)', () => {
    expect(body).toMatch(/\*:\s*focus-visible\s*\{[^}]*var\(--brand-accent\)/);
  });

  it('.ui-input:focus no longer uses the near-invisible --brand-hover shadow', () => {
    expect(body).not.toMatch(/\.ui-input:focus\s*\{[^}]*0 0 0 3px var\(--brand-hover\)/);
  });

  it('exposes a --focus-ring custom property', () => {
    expect(body).toMatch(/--focus-ring\s*:/);
  });
});
