import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TitleBar } from './TitleBar';

describe('TitleBar Update Actions and PWA Removal', () => {
  it('renders available update badge with version', () => {
    const html = renderToStaticMarkup(
      <TitleBar
        hasOpenAiKey={true}
        onOpenProviders={vi.fn()}
        onWindowControl={vi.fn()}
        onNavigateBack={vi.fn()}
        onNavigateForward={vi.fn()}
        canNavigateBack={false}
        canNavigateForward={false}
        updateStatus={{
          status: 'available',
          version: '0.45.0'
        }}
      />
    );
    expect(html).toContain('data-testid="update-available-badge"');
    expect(html).toContain('Update v0.45.0');
  });

  it('renders downloading state with spinner and progress', () => {
    const html = renderToStaticMarkup(
      <TitleBar
        hasOpenAiKey={true}
        onOpenProviders={vi.fn()}
        onWindowControl={vi.fn()}
        onNavigateBack={vi.fn()}
        onNavigateForward={vi.fn()}
        canNavigateBack={false}
        canNavigateForward={false}
        updateStatus={{
          status: 'downloading',
          progress: { percent: 45, bytesPerSecond: 1000, transferred: 450, total: 1000 }
        }}
      />
    );
    expect(html).toContain('data-testid="update-downloading-badge"');
    expect(html).toContain('animate-spin');
    expect(html).toContain('Downloading (45%)');
  });

  it('renders downloaded state with restart action', () => {
    const html = renderToStaticMarkup(
      <TitleBar
        hasOpenAiKey={true}
        onOpenProviders={vi.fn()}
        onWindowControl={vi.fn()}
        onNavigateBack={vi.fn()}
        onNavigateForward={vi.fn()}
        canNavigateBack={false}
        canNavigateForward={false}
        updateStatus={{
          status: 'downloaded',
          version: '0.45.0'
        }}
      />
    );
    expect(html).toContain('data-testid="update-downloaded-badge"');
    expect(html).toContain('Restart to update');
  });

  it('does not render PWA install button in web mode', () => {
    const html = renderToStaticMarkup(
      <TitleBar
        hasOpenAiKey={true}
        onOpenProviders={vi.fn()}
        onWindowControl={vi.fn()}
        onNavigateBack={vi.fn()}
        onNavigateForward={vi.fn()}
        canNavigateBack={false}
        canNavigateForward={false}
        isWebMode={true}
      />
    );
    expect(html).not.toContain('data-testid="pwa-install-button"');
    expect(html).not.toContain('Install SuperAgent App');
  });
});
