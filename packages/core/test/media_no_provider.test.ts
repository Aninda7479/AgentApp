import { describe, it, expect } from 'vitest';
import {
  AudioTranscriber,
  SpeechSynthesizer,
  VideoGenerator,
  ImageGenerator,
  ImageInpainter,
  BYOKConfig
} from '../src/index.js';
import { isMockKey, hasRealMediaKey, NO_PROVIDER_MESSAGE } from '../src/media/config.js';

/**
 * Regression suite for the media adapter "no provider connected" contract.
 *
 * Every adapter used to inline `config.apiKey.includes('mock')`, which throws a
 * cryptic `TypeError` when `apiKey` is `undefined` (a user who never connected a
 * provider) instead of returning the friendly NO_PROVIDER_MESSAGE. The mock-key
 * detection is now centralised in `isMockKey`, which guards against a missing
 * key. These tests lock that behavior in.
 */
describe('media adapters — no-provider / mock-key contract', () => {
  const undefinedKey = { provider: 'openai', apiKey: undefined as unknown as string } as BYOKConfig;
  const emptyKey = { provider: 'openai', apiKey: '' } as BYOKConfig;
  const realKey = { provider: 'openai', apiKey: 'sk-real-key' } as BYOKConfig;
  const mockKey = { provider: 'openai', apiKey: 'mock-key-12345' } as BYOKConfig;

  describe('key-detection helpers', () => {
    it('treat an undefined/empty key as neither real nor mock (no throw)', () => {
      expect(() => hasRealMediaKey(undefinedKey)).not.toThrow();
      expect(() => isMockKey(undefinedKey)).not.toThrow();
      expect(hasRealMediaKey(undefinedKey)).toBe(false);
      expect(isMockKey(undefinedKey)).toBe(false);
      expect(hasRealMediaKey(emptyKey)).toBe(false);
      expect(isMockKey(emptyKey)).toBe(false);
    });

    it('classify a real key as real and not mock', () => {
      expect(hasRealMediaKey(realKey)).toBe(true);
      expect(isMockKey(realKey)).toBe(false);
    });

    it('classify a mock key as mock and not real', () => {
      expect(hasRealMediaKey(mockKey)).toBe(false);
      expect(isMockKey(mockKey)).toBe(true);
    });
  });

  describe('adapters report a clear failure when no provider is configured', () => {
    it('AudioTranscriber returns NO_PROVIDER_MESSAGE, not a TypeError', async () => {
      const res = await new AudioTranscriber().transcribe(
        { audioBuffer: Buffer.from('audio-bytes') },
        undefinedKey
      );
      expect(res.status).toBe('failed');
      expect(res.error).toBe(NO_PROVIDER_MESSAGE);
    });

    it('SpeechSynthesizer returns NO_PROVIDER_MESSAGE, not a TypeError', async () => {
      const res = await new SpeechSynthesizer().synthesize({ text: 'hello' }, undefinedKey);
      expect(res.status).toBe('failed');
      expect(res.error).toBe(NO_PROVIDER_MESSAGE);
    });

    it('ImageGenerator returns NO_PROVIDER_MESSAGE, not a TypeError', async () => {
      const res = await new ImageGenerator().generateImage({ prompt: 'a cat' }, undefinedKey);
      expect(res.status).toBe('failed');
      expect(res.error).toBe(NO_PROVIDER_MESSAGE);
    });

    it('VideoGenerator returns NO_PROVIDER_MESSAGE, not a TypeError', async () => {
      const res = await new VideoGenerator().startJob({ prompt: 'a cat' }, undefinedKey);
      expect(res.status).toBe('failed');
      expect(res.error).toBe(NO_PROVIDER_MESSAGE);
    });

    it('ImageInpainter returns NO_PROVIDER_MESSAGE, not a TypeError', async () => {
      const res = await new ImageInpainter().inpaintOrEdit(
        { prompt: 'a cat', imageBuffer: Buffer.from('img-bytes') },
        undefinedKey
      );
      expect(res.status).toBe('failed');
      expect(res.error).toBe(NO_PROVIDER_MESSAGE);
    });
  });

  describe('mock-key fixtures are preserved', () => {
    it('AudioTranscriber still produces a simulated transcript for a mock key', async () => {
      const res = await new AudioTranscriber().transcribe(
        { audioBuffer: Buffer.from('audio-bytes') },
        mockKey
      );
      expect(res.status).toBe('success');
      expect(String(res.text)).toMatch(/simulated/i);
    });

    it('VideoGenerator still produces a completed mock job for a mock key', async () => {
      const res = await new VideoGenerator().startJob({ prompt: 'a cat' }, mockKey);
      expect(res.status).toBe('completed');
      expect(res.videoUrl).toContain('media.superagent.ai');
    });
  });
});
