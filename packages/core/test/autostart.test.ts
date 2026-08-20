import { describe, it, expect } from 'vitest';
import { AutostartManager } from '../src/startup/autostart.js';

describe('AutostartManager', () => {
  it('should retrieve autostart status without throwing', async () => {
    const isCliEnabled = await AutostartManager.isEnabled('cli');
    expect(typeof isCliEnabled).toBe('boolean');

    const isDesktopEnabled = await AutostartManager.isEnabled('desktop');
    expect(typeof isDesktopEnabled).toBe('boolean');

    const isSync = AutostartManager.isEnabledSync('cli');
    expect(typeof isSync).toBe('boolean');
  });

  it('should return valid info payload for cli and desktop', async () => {
    const cliInfo = await AutostartManager.getInfo('cli');
    expect(cliInfo.target).toBe('cli');
    expect(typeof cliInfo.platform).toBe('string');
    expect(typeof cliInfo.command).toBe('string');
    expect(cliInfo.command).toContain('--serve');

    const desktopInfo = await AutostartManager.getInfo('desktop');
    expect(desktopInfo.target).toBe('desktop');
    expect(desktopInfo.command).toContain('--autostart');
  });
});
