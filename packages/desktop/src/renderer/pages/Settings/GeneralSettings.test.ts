import { describe, it, expect } from 'vitest';
import { FULL_SYSTEM_ACCESS_TOGGLE } from './GeneralSettings.js';

/**
 * The terminal execution-scope toggle must read as plain language a first-time
 * user understands: the ON state is "Full System Access" (not the old jargon
 * "Unsandboxed Terminal Actions"), and the description must make clear that OFF
 * is the recommended, sandboxed default and that destructive commands are always
 * blocked. This is the safety-default clarity called out by the ux-critic pass;
 * locking the copy in prevents a future edit from reverting to opaque wording.
 */
describe('FULL_SYSTEM_ACCESS_TOGGLE copy', () => {
  it('names the ON state plainly, not in sandbox jargon', () => {
    expect(FULL_SYSTEM_ACCESS_TOGGLE.label).toBe('Full System Access');
    expect(FULL_SYSTEM_ACCESS_TOGGLE.label).not.toMatch(/unsandboxed/i);
  });

  it('tells the user OFF is the recommended sandboxed default', () => {
    const d = FULL_SYSTEM_ACCESS_TOGGLE.description.toLowerCase();
    expect(d).toContain('recommended');
    expect(d).toContain('project folder');
  });

  it('makes clear destructive commands are always blocked', () => {
    const d = FULL_SYSTEM_ACCESS_TOGGLE.description.toLowerCase();
    expect(d).toContain('always blocked');
  });
});
