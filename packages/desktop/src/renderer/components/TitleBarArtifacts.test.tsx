import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TitleBar } from './TitleBar';
import { ArtifactsPage } from '../pages/Artifacts/ArtifactsPage';

describe('TitleBar File Menu - Artifacts Page Link', () => {
  it('renders TitleBar with File menu structure', () => {
    const html = renderToStaticMarkup(
      <TitleBar
        hasOpenAiKey={true}
        onOpenProviders={vi.fn()}
        onWindowControl={vi.fn()}
        onNavigateBack={vi.fn()}
        onNavigateForward={vi.fn()}
        canNavigateBack={false}
        canNavigateForward={false}
        onOpenArtifacts={vi.fn()}
      />
    );
    expect(html).toContain('File');
    expect(html).toContain('Edit');
  });
});

describe('ArtifactsPage Component', () => {
  it('renders ArtifactsPage header and empty state or controls', () => {
    const html = renderToStaticMarkup(
      <ArtifactsPage
        ipc={{ invoke: vi.fn() }}
        triggerToast={vi.fn()}
        onBack={vi.fn()}
        onNewChat={vi.fn()}
      />
    );
    expect(html).toContain('Artifacts &amp; Micro-Apps');
    expect(html).toContain('~/.superagent/artifacts');
    expect(html).toContain('Seed Starter Apps');
    expect(html).toContain('Open Folder');
  });
});
