import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VideoModelSelect } from './VideoModelSelect';
import { VideoModelOption } from '../types';

describe('VideoModelSelect Component', () => {
  it('renders default button state with local model', () => {
    const html = renderToStaticMarkup(
      <VideoModelSelect
        selectedModelId="wan2.1-t2v-1.3b-q40"
        onSelectModel={vi.fn()}
      />
    );

    // Initial placeholder or model name
    expect(html).toContain('Select Video Model');
  });

  it('renders online video model with cloud badge', () => {
    const onlineModels: VideoModelOption[] = [
      {
        id: 'veo-2.0-generate-001',
        name: 'Google Veo 2.0',
        source: 'cloud',
        providerId: 'google',
        inputModalities: ['text', 'image', 'video'],
        outputModalities: ['video'],
        modality: 'both',
      },
      {
        id: 'kling-video-v1.5',
        name: 'Kuaishou Kling 1.5 HD',
        source: 'cloud',
        providerId: 'openrouter',
        inputModalities: ['text', 'image'],
        outputModalities: ['video'],
        modality: 'image_to_video',
      },
    ];

    const html = renderToStaticMarkup(
      <VideoModelSelect
        selectedModelId="veo-2.0-generate-001"
        onSelectModel={vi.fn()}
        onlineModels={onlineModels}
      />
    );

    expect(html).toContain('Google Veo 2.0');
    expect(html).toContain('Cloud');
    expect(html).toContain('T2V/I2V');
  });
});
