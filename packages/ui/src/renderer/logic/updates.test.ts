import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compareSemver, UpdateService } from './updates';
import type { AppContext } from './types';

describe('compareSemver', () => {
  it('returns -1 when remote version is newer', () => {
    expect(compareSemver('0.27.1', '0.27.2')).toBe(-1);
    expect(compareSemver('0.27.1', '0.28.0')).toBe(-1);
    expect(compareSemver('0.27.1', '1.0.0')).toBe(-1);
    expect(compareSemver('v0.27.1', 'v0.28.0')).toBe(-1);
  });

  it('returns 1 when current version is newer', () => {
    expect(compareSemver('0.28.0', '0.27.1')).toBe(1);
    expect(compareSemver('1.0.0', '0.9.9')).toBe(1);
  });

  it('returns 0 when versions are identical', () => {
    expect(compareSemver('0.27.1', '0.27.1')).toBe(0);
    expect(compareSemver('v0.27.1', '0.27.1')).toBe(0);
  });

  it('handles irregular semver tags gracefully', () => {
    expect(compareSemver('0.27.1-beta.1', '0.27.2')).toBe(-1);
    expect(compareSemver('0.27.1', '0.27.1-rc1')).toBe(0);
  });
});

describe('UpdateService.check', () => {
  let mockCtx: Partial<AppContext>;
  let updateStatusState: any = null;

  beforeEach(() => {
    updateStatusState = null;
    mockCtx = {
      setActiveTab: vi.fn(),
      setSettingsCategory: vi.fn(),
      setUpdateStatus: vi.fn((status) => {
        updateStatusState = typeof status === 'function' ? status(updateStatusState) : status;
      }),
      ipc: null
    };
    vi.restoreAllMocks();
  });

  it('marks available when /api/update/check returns hasUpdate true', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        current: '0.27.1',
        latest: '0.28.0',
        hasUpdate: true
      })
    } as any);

    await UpdateService.check(mockCtx as AppContext);

    expect(mockCtx.setUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'available',
        version: '0.28.0'
      })
    );
  });

  it('marks not-available when /api/update/check returns hasUpdate false', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        current: '0.28.0',
        latest: '0.28.0',
        hasUpdate: false
      })
    } as any);

    await UpdateService.check(mockCtx as AppContext);

    expect(mockCtx.setUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'not-available',
        message: 'SuperAgent is up to date.'
      })
    );
  });

  it('handles IPC check-for-updates response accurately', async () => {
    mockCtx.ipc = {
      invoke: vi.fn().mockResolvedValueOnce({
        status: 'available',
        version: '0.29.0',
        message: 'Version v0.29.0 is available!'
      }),
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn()
    };

    await UpdateService.check(mockCtx as AppContext);

    expect(mockCtx.setUpdateStatus).toHaveBeenCalledWith({
      status: 'available',
      version: '0.29.0',
      message: 'Version v0.29.0 is available!'
    });
  });
});
