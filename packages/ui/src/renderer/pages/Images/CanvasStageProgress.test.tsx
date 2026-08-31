import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CanvasStage } from './components/CanvasStage';
import { GenerationStepProgress } from './types';

describe('CanvasStage Step Progression', () => {
  const defaultBrandLogo = {
    enabled: false,
    source: 'superagent' as const,
    placement: 'bottom-right' as const,
    opacity: 0.85,
    scale: 0.18,
  };

  it('renders step progression HUD with step counter, percentage, speed, and ETA', () => {
    const progress: GenerationStepProgress = {
      step: 12,
      totalSteps: 20,
      progress: 0.6,
      phase: 'Sampling diffusion latents (Step 12/20)',
      stepTimeMs: 1200,
      etaSeconds: 9.6,
      elapsedSeconds: 14.4,
    };

    const html = renderToStaticMarkup(
      <CanvasStage
        generating={true}
        generationTime={14}
        generationProgress={progress}
        selectedRecord={null}
        referenceImage={null}
        brandLogo={defaultBrandLogo}
        onCopyImage={vi.fn()}
        onDeleteRecord={vi.fn()}
        onCancelGeneration={vi.fn()}
        copied={false}
      />
    );

    expect(html).toContain('Step 12 of 20');
    expect(html).toContain('60%');
    expect(html).toContain('Sampling diffusion latents (Step 12/20)');
    expect(html).toContain('1.20s/it');
    expect(html).toContain('~10s left');
    expect(html).toContain('Cancel Generation');
  });

  it('renders intermediate preview image when previewDataUrl is present', () => {
    const progress: GenerationStepProgress = {
      step: 8,
      totalSteps: 20,
      progress: 0.4,
      phase: 'Sampling diffusion latents',
      previewDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      elapsedSeconds: 8,
    };

    const html = renderToStaticMarkup(
      <CanvasStage
        generating={true}
        generationTime={8}
        generationProgress={progress}
        selectedRecord={null}
        referenceImage={null}
        brandLogo={defaultBrandLogo}
        onCopyImage={vi.fn()}
        onDeleteRecord={vi.fn()}
        copied={false}
      />
    );

    expect(html).toContain('alt="Denoising step preview"');
    expect(html).toContain('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
  });
});

