import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImageModelSelect } from './components/ImageModelSelect';
import { ImageModelInfo } from '../../services/imageService';

const mockModels: ImageModelInfo[] = [
  {
    id: 'sd15-v1-5-pruned-q40',
    name: 'Stable Diffusion 1.5 (Q4_0)',
    family: 'sd15',
    quantization: 'Q4_0',
    download_url: 'https://example.com/sd15.gguf',
    filename: 'v1-5-pruned-emaonly-Q4_0.gguf',
    size_bytes: 1800000000,
    vram_required_mb: 3072,
    default_steps: 20,
    default_cfg: 7.0,
    is_downloaded: true,
    is_downloading: false,
  },
  {
    id: 'flux-1-schnell-q40',
    name: 'FLUX.1 Schnell (Q4_0)',
    family: 'flux',
    quantization: 'Q4_0',
    download_url: 'https://example.com/flux.gguf',
    filename: 'flux1-schnell-q4_0.gguf',
    size_bytes: 6500000000,
    vram_required_mb: 8192,
    default_steps: 4,
    default_cfg: 3.5,
    is_downloaded: false,
    is_downloading: false,
  },
];

describe('ImageModelSelect Component', () => {
  it('renders active downloaded model with name, family, and quantization', () => {
    const html = renderToStaticMarkup(
      <ImageModelSelect
        models={mockModels}
        selectedModelId="sd15-v1-5-pruned-q40"
        onSelectModel={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    );

    expect(html).toContain('Stable Diffusion 1.5 (Q4_0)');
    expect(html).toContain('SD 1.5');
    expect(html).toContain('Q4_0');
    expect(html).toContain('1.8 GB');
    // Does NOT render uninstalled model as active
    expect(html).not.toContain('FLUX.1 Schnell');
  });

  it('renders empty warning state when no models are downloaded', () => {
    const emptyModels = mockModels.map((m) => ({ ...m, is_downloaded: false }));
    const html = renderToStaticMarkup(
      <ImageModelSelect
        models={emptyModels}
        selectedModelId=""
        onSelectModel={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    );

    expect(html).toContain('No local models installed');
    expect(html).toContain('Download a model from settings');
  });
});
