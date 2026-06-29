import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  MediaPipelineRouter,
  ImageGenerator,
  ImageInpainter,
  ImageAssetCache,
  SpeechSynthesizer,
  AudioTranscriber,
  VideoGenerator,
  VideoAssetManager,
  BYOKConfig
} from '../src/index.js';
import sharp from 'sharp';

describe('Phase 3 AI Multimodal & Media Processing Suite (Steps 041-048)', () => {
  const tempDir = path.join(os.tmpdir(), `superagent-media-test-${Date.now()}`);
  const mockConfig: BYOKConfig = {
    provider: 'openai',
    apiKey: 'mock-key-12345'
  };

  beforeEach(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Step 041: AI Media Tool Pipeline Router', () => {
    it('should route image generation task successfully', async () => {
      const router = new MediaPipelineRouter();
      const result = await router.executeTask({
        taskType: 'image-generation',
        imageGen: { prompt: 'A futuristic city skyline at sunset' }
      }, mockConfig);

      expect(result.status).toBe('success');
      expect(result.taskType).toBe('image-generation');
      expect(result.result).toBeDefined();
    });

    it('should route speech synthesis task successfully', async () => {
      const router = new MediaPipelineRouter();
      const result = await router.executeTask({
        taskType: 'speech-synthesis',
        speechSynth: { text: 'Welcome to SuperAgent media suite.' }
      }, mockConfig);

      expect(result.status).toBe('success');
      expect(result.taskType).toBe('speech-synthesis');
    });

    it('should return error when required parameters are missing', async () => {
      const router = new MediaPipelineRouter();
      const result = await router.executeTask({
        taskType: 'image-generation'
      }, mockConfig);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Missing imageGen parameters');
    });
  });

  describe('Step 042: AI Image Generation Tool Handler', () => {
    it('should generate image with default options in mock mode', async () => {
      const generator = new ImageGenerator();
      const res = await generator.generateImage({
        prompt: 'A cute robot playing chess',
        n: 2
      }, mockConfig);

      expect(res.status).toBe('success');
      expect(res.images.length).toBe(2);
      expect(res.images[0].url).toContain('https://media.superagent.ai/generated/');
    });

    it('should return base64 json format when requested', async () => {
      const generator = new ImageGenerator();
      const res = await generator.generateImage({
        prompt: 'Cyberpunk landscape',
        responseFormat: 'b64_json'
      }, mockConfig);

      expect(res.status).toBe('success');
      expect(res.images[0].b64_json).toBeDefined();
    });

    it('should handle API network responses when real API key is passed', async () => {
      const generator = new ImageGenerator();
      const realConfig: BYOKConfig = { provider: 'openai', apiKey: 'sk-real-test-key' };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ url: 'https://oaidalleapi.com/img1.png' }] })
      }));

      const res = await generator.generateImage({ prompt: 'Test real prompt' }, realConfig);
      expect(res.status).toBe('success');
      expect(res.images[0].url).toBe('https://oaidalleapi.com/img1.png');
    });
  });

  describe('Step 043: AI Image Editing & Inpainting Adapter', () => {
    it('should prepare mask and handle image inpainting', async () => {
      const inpainter = new ImageInpainter();
      const dummyImage = await sharp({
        create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } }
      }).png().toBuffer();

      const dummyMask = await sharp({
        create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } }
      }).png().toBuffer();

      const preparedMask = await inpainter.prepareMask(dummyMask, 100, 100);
      expect(preparedMask).toBeDefined();

      const res = await inpainter.inpaintOrEdit({
        imageBuffer: dummyImage,
        maskBuffer: dummyMask,
        prompt: 'Replace background with mountains'
      }, mockConfig);

      expect(res.status).toBe('success');
      expect(res.images.length).toBe(1);
    });

    it('should fail if image buffer is missing', async () => {
      const inpainter = new ImageInpainter();
      const res = await inpainter.inpaintOrEdit({
        imageBuffer: Buffer.alloc(0),
        prompt: 'Edit image'
      }, mockConfig);

      expect(res.status).toBe('failed');
      expect(res.error).toContain('Source image buffer cannot be empty');
    });
  });

  describe('Step 044: Image Asset Metadata & Local Caching', () => {
    it('should cache asset and write sidecar metadata file', async () => {
      const cache = new ImageAssetCache({ cacheDir: tempDir });
      const testBuffer = await sharp({
        create: { width: 200, height: 150, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } }
      }).png().toBuffer();

      const { filePath, metadata } = await cache.cacheAsset('test_img_1', testBuffer, {
        prompt: 'Green box',
        provider: 'openai'
      });

      expect(fs.existsSync(filePath)).toBe(true);
      expect(metadata.width).toBe(200);
      expect(metadata.height).toBe(150);
      expect(metadata.format).toBe('png');

      const retrieved = await cache.getAsset('test_img_1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.metadata.prompt).toBe('Green box');
    });

    it('should list and clear cached assets', async () => {
      const cache = new ImageAssetCache({ cacheDir: tempDir });
      const buf = Buffer.from('mock-png-bytes');
      await cache.cacheAsset('asset_a', buf, { format: 'png', width: 10, height: 10 });
      await cache.cacheAsset('asset_b', buf, { format: 'png', width: 10, height: 10 });

      const list = await cache.listAssets();
      expect(list.length).toBe(2);

      await cache.clearCache();
      const listAfter = await cache.listAssets();
      expect(listAfter.length).toBe(0);
    });
  });

  describe('Step 045: AI Speech Synthesis Tool Handler (TTS)', () => {
    it('should synthesize speech and return audio buffer in mock mode', async () => {
      const tts = new SpeechSynthesizer();
      const res = await tts.synthesize({
        text: 'Testing text-to-speech synthesis engine.',
        voice: 'nova',
        responseFormat: 'mp3'
      }, mockConfig);

      expect(res.status).toBe('success');
      expect(res.audioBuffer).toBeDefined();
      expect(res.format).toBe('mp3');
      expect(res.durationSeconds).toBeGreaterThan(0);
    });
  });

  describe('Step 046: AI Audio Processing & STT Transcriber (Whisper)', () => {
    it('should transcribe audio buffer and return segments in mock mode', async () => {
      const stt = new AudioTranscriber();
      const mockAudio = Buffer.from('fake-audio-header-and-content');
      const res = await stt.transcribe({
        audioBuffer: mockAudio,
        language: 'en'
      }, mockConfig);

      expect(res.status).toBe('success');
      expect(res.text).toContain('simulated transcription');
      expect(res.segments?.length).toBeGreaterThan(0);
    });
  });

  describe('Step 047: AI Video Generation Tool Handler (Sora/Runway)', () => {
    it('should start video generation job and check status', async () => {
      const videoGen = new VideoGenerator();
      const job = await videoGen.startJob({
        prompt: 'A cinematic shot of a drone flying through a neon canyon',
        durationSeconds: 10,
        aspectRatio: '16:9'
      }, mockConfig);

      expect(job.status).toBe('completed');
      expect(job.videoUrl).toContain('.mp4');

      const statusCheck = await videoGen.getJobStatus(job.jobId, mockConfig);
      expect(statusCheck.jobId).toBe(job.jobId);
    });
  });

  describe('Step 048: Video Asset Manager & Streaming Previews', () => {
    it('should save video asset, retrieve metadata, and generate streaming preview', async () => {
      const manager = new VideoAssetManager({ storageDir: tempDir });
      const mockVideoBuf = Buffer.from('HEADER_MP4_SAMPLE_DATA_STREAM');

      const { filePath, metadata } = await manager.saveVideoAsset('vid_100', mockVideoBuf, {
        durationSeconds: 8.5,
        width: 1280,
        height: 720
      });

      expect(fs.existsSync(filePath)).toBe(true);
      expect(metadata.durationSeconds).toBe(8.5);

      const preview = await manager.generateStreamingPreview('vid_100', { frameRate: 15 });
      expect(preview.contentType).toBe('video/mp4');
      expect(preview.previewBuffer.toString()).toContain('PREVIEW_HEADER_fps=15');

      const deleted = await manager.deleteVideoAsset('vid_100');
      expect(deleted).toBe(true);
    });
  });
});
