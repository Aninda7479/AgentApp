import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { UpdatesSettings } from '../src/renderer/pages/Settings/UpdatesSettings';

// Mock getIpc since we are not in Electron environment during tests
vi.mock('../src/renderer/lib/electron', () => ({
  getIpc: () => ({
    invoke: vi.fn().mockResolvedValue({ general: { releaseChannel: 'stable' } }),
    on: vi.fn(),
    removeListener: vi.fn()
  })
}));

describe('UpdatesSettings UI', () => {
  it('renders the current version and update button', () => {
    const html = renderToString(
      <UpdatesSettings 
        appVersion="0.2.0"
        updateStatus={null}
        onCheckForUpdates={() => {}}
        checking={false}
      />
    );
    expect(html).toContain('0.2.0');
    expect(html).toContain('Check for Updates');
    expect(html).toContain('Release Channel');
  });

  it('renders progress bar when status is downloading', () => {
    const html = renderToString(
      <UpdatesSettings 
        appVersion="0.2.0"
        updateStatus={{
          status: 'downloading',
          message: 'Downloading update: 52%',
          progress: {
            percent: 52,
            bytesPerSecond: 4194304, // 4MB/s
            transferred: 41943040, // 40MB
            total: 83886080 // 80MB
          }
        }}
        onCheckForUpdates={() => {}}
        checking={false}
      />
    );
    expect(html).toContain('Downloading update: 52%');
    expect(html).toContain('width:52%');
    expect(html).toContain('40.0');
    expect(html).toContain('80.0');
  });

  it('renders Restart and Install button when status is downloaded', () => {
    const html = renderToString(
      <UpdatesSettings 
        appVersion="0.2.0"
        updateStatus={{
          status: 'downloaded',
          message: 'Update downloaded: v0.3.0',
          version: '0.3.0'
        }}
        onCheckForUpdates={() => {}}
        checking={false}
      />
    );
    expect(html).toContain('Update downloaded: v0.3.0');
    expect(html).toContain('Restart and Install');
  });
});
