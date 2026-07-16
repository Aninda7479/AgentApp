import { describe, it, expect } from 'vitest';
import { VideoGenerator } from '../src/media/video.js';
import { NO_PROVIDER_MESSAGE } from '../src/media/config.js';
import type { BYOKConfig } from '../src/types/agent.js';

function makeConfig(overrides: Partial<BYOKConfig> = {}): BYOKConfig {
  return {
    provider: 'openai',
    apiKey: '',
    modelName: 'sora',
    ...overrides
  } as BYOKConfig;
}

describe('VideoGenerator', () => {
  it('fails with a clear message when no provider is connected', async () => {
    const gen = new VideoGenerator();
    const job = await gen.startJob({ prompt: 'a cat playing piano' }, makeConfig());

    expect(job.status).toBe('failed');
    expect(job.videoUrl).toBeUndefined();
    expect(job.previewImageUrl).toBeUndefined();
    expect(job.error).toBe(NO_PROVIDER_MESSAGE);
  });

  it('still returns a completed mock job when an explicit mock key is supplied', async () => {
    const gen = new VideoGenerator();
    const job = await gen.startJob(
      { prompt: 'a cat playing piano' },
      makeConfig({ apiKey: 'mock-key' })
    );

    expect(job.status).toBe('completed');
    expect(job.progress).toBe(100);
    expect(job.videoUrl).toContain('media.superagent.ai/video/');
  });

  it('rejects an empty prompt without an API call', async () => {
    const gen = new VideoGenerator();
    const job = await gen.startJob({ prompt: '   ' }, makeConfig());

    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/cannot be empty/i);
  });

  it('getJobStatus reports a not-found failure for an unknown id with no provider', async () => {
    const gen = new VideoGenerator();
    const job = await gen.getJobStatus('does-not-exist', makeConfig());

    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/job not found/i);
  });
});
