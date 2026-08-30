import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TitleBar } from './TitleBar';
import { ImageWorkspacePage } from '../pages/Images/ImageWorkspacePage';
import { LocalImageModelSettings } from '../pages/Settings/LocalImageModelSettings';

describe('TitleBar Top Bar - Image Workspace Link', () => {
  it('renders TitleBar with Image Workspace handler and container', () => {
    const onOpenImage = vi.fn();
    const html = renderToStaticMarkup(
      <TitleBar
        hasOpenAiKey={true}
        onOpenProviders={vi.fn()}
        onWindowControl={vi.fn()}
        onNavigateBack={vi.fn()}
        onNavigateForward={vi.fn()}
        canNavigateBack={false}
        canNavigateForward={false}
        onOpenImageWorkspace={onOpenImage}
      />
    );
    expect(html).toContain('data-testid="title-bar"');
  });
});

describe('ImageWorkspacePage Component', () => {
  it('renders Image Workspace studio with prompt box and aspect ratio controls', () => {
    const html = renderToStaticMarkup(
      <ImageWorkspacePage
        triggerToast={vi.fn()}
        onBack={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    );
    expect(html).toContain('Image Workspace');
    expect(html).toContain('Prompt');
    expect(html).toContain('Aspect Ratio');
    expect(html).toContain('Generate Image');
  });
});

describe('LocalImageModelSettings Component', () => {
  it('renders Local Image Model settings panel with engine and model catalog', () => {
    const html = renderToStaticMarkup(
      <LocalImageModelSettings onToast={vi.fn()} />
    );
    expect(html).toContain('Local Image Model');
    expect(html).toContain('stable-diffusion.cpp');
    expect(html).toContain('Install Image Engine');
    expect(html).toContain('Installed Image Models');
    expect(html).toContain('Hardware &amp; Diffusion Budget');
  });
});
