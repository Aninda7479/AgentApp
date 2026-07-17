import { describe, it, expect } from 'vitest';
import { MediaPipelineRouter, type MediaTaskRequest } from '../src/media/router.js';

/**
 * Unit tests for the media generation pipeline dispatcher (mission point #3 —
 * capability adapters behind a common interface). These cover the
 * request-validation / error paths, which need no live provider call. The
 * happy paths (real image/audio/video generation) are out of scope here: they
 * require a connected provider and are exercised by the GUI, not this suite.
 */

// The adapters are only constructed, never invoked, on these error paths, so a
// plausible config object is enough — no real credentials are used.
const dummyConfig = { provider: 'openai', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' } as any;
const router = new MediaPipelineRouter();

describe('MediaPipelineRouter.executeTask — missing-parameter guards', () => {
  it('fails image-generation when imageGen params are absent', async () => {
    const res = await router.executeTask({ taskType: 'image-generation' }, dummyConfig);
    expect(res.status).toBe('failed');
    expect(res.error).toMatch(/missing imagegen/i);
  });

  it('fails image-inpainting when imageInpaint params are absent', async () => {
    const res = await router.executeTask({ taskType: 'image-inpainting' }, dummyConfig);
    expect(res.status).toBe('failed');
    expect(res.error).toMatch(/missing imageinpaint/i);
  });

  it('fails speech-synthesis when speechSynth params are absent', async () => {
    const res = await router.executeTask({ taskType: 'speech-synthesis' }, dummyConfig);
    expect(res.status).toBe('failed');
    expect(res.error).toMatch(/missing speechsynth/i);
  });

  it('fails audio-transcription when audioTranscribe params are absent', async () => {
    const res = await router.executeTask({ taskType: 'audio-transcription' }, dummyConfig);
    expect(res.status).toBe('failed');
    expect(res.error).toMatch(/missing audiotranscribe/i);
  });

  it('fails video-generation when videoGen params are absent', async () => {
    const res = await router.executeTask({ taskType: 'video-generation' }, dummyConfig);
    expect(res.status).toBe('failed');
    expect(res.error).toMatch(/missing videogen/i);
  });
});

describe('MediaPipelineRouter.executeTask — unknown task type', () => {
  it('fails with an explicit unsupported-task error', async () => {
    const res = await router.executeTask({ taskType: 'not-a-real-task' as MediaTaskRequest['taskType'] }, dummyConfig);
    expect(res.status).toBe('failed');
    expect(res.error).toMatch(/unsupported media task type/i);
  });
});

describe('MediaPipelineRouter.executeTask — task id handling', () => {
  it('echoes a caller-supplied task id and still fails on missing params', async () => {
    const res = await router.executeTask({ id: 'my-task', taskType: 'image-generation' }, dummyConfig);
    expect(res.taskId).toBe('my-task');
    expect(res.status).toBe('failed');
  });
});
