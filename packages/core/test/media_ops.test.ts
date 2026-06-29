import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  MediaExporter,
  VisionInputProcessor,
  MediaQuotaMonitor,
  MediaJobPoller,
  MediaGalleryIndexer,
  MediaTestBench
} from '../src/index.js';

describe('Media Operations Suite (Steps 055 - 060)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(process.cwd(), '.test_media_ops_' + Math.random().toString(36).substring(2, 7));
    if (!fs.existsSync(tempDir)) {
      await fs.promises.mkdir(tempDir, { recursive: true });
    }
  });

  afterEach(async () => {
    if (fs.existsSync(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  // Step 055: Media Artifact Exporter Utility
  describe('Step 055: MediaExporter', () => {
    let exporter: MediaExporter;

    beforeEach(() => {
      exporter = new MediaExporter();
    });

    it('should export asset from buffer to target directory', async () => {
      const buffer = Buffer.from('MOCK_IMAGE_DATA_123');
      const targetDir = path.join(tempDir, 'exports');
      const result = await exporter.exportAssetFromBuffer('asset-1', buffer, 'logo.png', 'image', {
        targetDir
      });

      expect(result.assetId).toBe('asset-1');
      expect(result.bytesExported).toBe(buffer.length);
      expect(fs.existsSync(result.targetPath)).toBe(true);
      const readContent = await fs.promises.readFile(result.targetPath, 'utf8');
      expect(readContent).toBe('MOCK_IMAGE_DATA_123');
    });

    it('should export asset from existing disk file', async () => {
      const sourceFile = path.join(tempDir, 'source.mp4');
      await fs.promises.writeFile(sourceFile, 'MOCK_VIDEO_BINARY');

      const targetDir = path.join(tempDir, 'out_videos');
      const result = await exporter.exportAssetFromFile('video-1', sourceFile, 'video', {
        targetDir,
        customFilename: 'intro.mp4'
      });

      expect(result.assetId).toBe('video-1');
      expect(result.targetPath).toContain('intro.mp4');
      expect(fs.existsSync(result.targetPath)).toBe(true);
    });

    it('should support batch export of multiple assets', async () => {
      const targetDir = path.join(tempDir, 'batch_out');
      const results = await exporter.exportBatch(
        [
          { assetId: 'b1', buffer: Buffer.from('buf1'), filename: 'doc1.pdf', mediaType: 'pdf' },
          { assetId: 'b2', buffer: Buffer.from('buf2'), filename: 'doc2.ppt', mediaType: 'ppt' }
        ],
        { targetDir }
      );

      expect(results.length).toBe(2);
      expect(fs.existsSync(results[0].targetPath)).toBe(true);
      expect(fs.existsSync(results[1].targetPath)).toBe(true);
    });

    it('should prevent overwriting existing files unless explicitly allowed', async () => {
      const targetDir = path.join(tempDir, 'overwrite_test');
      const buffer = Buffer.from('initial content');
      const res1 = await exporter.exportAssetFromBuffer('a1', buffer, 'file.txt', 'document', { targetDir });

      // Second attempt without overwrite should fail
      await expect(
        exporter.exportAssetFromBuffer('a2', Buffer.from('new content'), 'file.txt', 'document', { targetDir })
      ).rejects.toThrow('already exists');

      // Attempt with overwrite should succeed
      const res2 = await exporter.exportAssetFromBuffer('a2', Buffer.from('new content'), 'file.txt', 'document', {
        targetDir,
        overwrite: true
      });
      expect(res2.targetPath).toBe(res1.targetPath);
      expect(await fs.promises.readFile(res2.targetPath, 'utf8')).toBe('new content');
    });
  });

  // Step 056: Multimodal Vision Input Processor
  describe('Step 056: VisionInputProcessor', () => {
    let processor: VisionInputProcessor;

    beforeEach(() => {
      processor = new VisionInputProcessor();
    });

    it('should prepare vision attachment from raw image buffer', async () => {
      const mockBuffer = Buffer.from('sample_png_bytes');
      const attachment = await processor.prepareAttachment({
        buffer: mockBuffer,
        mimeType: 'image/png',
        detail: 'high'
      });

      expect(attachment.id).toBeDefined();
      expect(attachment.mimeType).toBe('image/png');
      expect(attachment.dataUrl).toContain('data:image/png;base64,');
      expect(attachment.detail).toBe('high');
      expect(attachment.sizeBytes).toBe(mockBuffer.length);
    });

    it('should format text prompt and vision attachments into LLM payload', async () => {
      const attachment = await processor.prepareAttachment({
        buffer: Buffer.from('img'),
        mimeType: 'image/jpeg'
      });

      const message = processor.formatPromptWithVision('What is in this mockup?', [attachment]);
      expect(message.role).toBe('user');
      expect(message.content.length).toBe(2);
      expect(message.content[0]).toEqual({ type: 'text', text: 'What is in this mockup?' });
      expect(message.content[1]).toEqual({
        type: 'image_url',
        image_url: { url: attachment.dataUrl, detail: 'auto' }
      });
    });

    it('should extract vision metadata from attachment source', async () => {
      const attachment = await processor.prepareAttachment({
        buffer: Buffer.from('test_img'),
        mimeType: 'image/webp'
      });

      const meta = await processor.extractVisionMetadata(attachment);
      expect(meta.mimeType).toBe('image/webp');
      expect(meta.sizeBytes).toBe(Buffer.from('test_img').length);
    });
  });

  // Step 057: Media Generation Rate Limit & Quota Monitor
  describe('Step 057: MediaQuotaMonitor', () => {
    let quota: MediaQuotaMonitor;

    beforeEach(() => {
      quota = new MediaQuotaMonitor({
        maxDailyBudget: 2.0,
        maxMonthlyBudget: 10.0,
        warningThresholdPercent: 75
      });
    });

    it('should estimate cost for different media types correctly', () => {
      const videoCost = quota.estimateCost('video', 'runway', { durationSeconds: 10 });
      const imageHdCost = quota.estimateCost('image', 'openai', { quality: 'hd', n: 2 });
      const pdfCost = quota.estimateCost('pdf', 'local');

      expect(videoCost).toBe(0.50); // 10s * 0.05
      expect(imageHdCost).toBe(0.16); // 2 * 0.08
      expect(pdfCost).toBe(0.01);
    });

    it('should allow requests within budget limits', () => {
      const check = quota.checkQuota('image', 'openai');
      expect(check.allowed).toBe(true);
      expect(check.reason).toBeUndefined();
    });

    it('should trigger warnings when approaching budget threshold', () => {
      quota.recordUsage({ mediaType: 'video', provider: 'runway', estimatedCost: 1.55 });
      const check = quota.checkQuota('image', 'openai'); // 1.55 + 0.04 = 1.59 >= 2.0 * 0.75 (1.50)
      expect(check.allowed).toBe(true);
      expect(check.warning).toContain('Approaching daily media budget limit');
    });

    it('should reject requests that exceed daily budget', () => {
      quota.recordUsage({ mediaType: 'video', provider: 'runway', estimatedCost: 1.95 });
      const check = quota.checkQuota('image', 'openai', { quality: 'hd' }); // 1.95 + 0.08 = 2.03 > 2.0
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Daily media generation budget exceeded');
    });

    it('should record usage and aggregate statistics', () => {
      quota.recordUsage({ mediaType: 'image', provider: 'openai', estimatedCost: 0.08 });
      quota.recordUsage({ mediaType: 'audio', provider: 'elevenlabs', estimatedCost: 0.02 });

      const stats = quota.getUsageStats();
      expect(stats.count).toBe(2);
      expect(stats.totalCost).toBe(0.1);
      expect(stats.byType.image).toBe(0.08);
      expect(stats.byType.audio).toBe(0.02);
    });
  });

  // Step 058: Async Media Job Status Poller
  describe('Step 058: MediaJobPoller', () => {
    let poller: MediaJobPoller;

    beforeEach(() => {
      poller = new MediaJobPoller();
    });

    it('should register and retrieve media jobs', () => {
      const job = poller.registerJob({
        jobId: 'job-100',
        mediaType: 'video',
        status: 'queued',
        createdAt: Date.now()
      });

      expect(job.jobId).toBe('job-100');
      expect(poller.getJob('job-100')?.status).toBe('queued');
    });

    it('should poll job status until completed', async () => {
      poller.registerJob({
        jobId: 'job-async',
        mediaType: 'video',
        status: 'queued',
        createdAt: Date.now()
      });

      let count = 0;
      const finalJob = await poller.pollJob(
        'job-async',
        async () => {
          count += 1;
          if (count === 3) {
            return { status: 'completed', progress: 100, resultUrl: 'https://cdn.example.com/video.mp4' };
          }
          return { status: 'processing', progress: count * 30 };
        },
        { intervalMs: 10 }
      );

      expect(finalJob.status).toBe('completed');
      expect(finalJob.progress).toBe(100);
      expect(finalJob.resultUrl).toBe('https://cdn.example.com/video.mp4');
      expect(count).toBe(3);
    });

    it('should allow job cancellation', () => {
      poller.registerJob({
        jobId: 'job-cancel',
        mediaType: 'image',
        status: 'processing',
        createdAt: Date.now()
      });

      const cancelled = poller.cancelJob('job-cancel');
      expect(cancelled).toBe(true);
      expect(poller.getJob('job-cancel')?.status).toBe('cancelled');
    });
  });

  // Step 059: Generated Media Asset Gallery Indexer
  describe('Step 059: MediaGalleryIndexer', () => {
    let gallery: MediaGalleryIndexer;

    beforeEach(() => {
      gallery = new MediaGalleryIndexer();
    });

    it('should index and retrieve media items', () => {
      const item = gallery.indexItem({
        id: 'asset-ui',
        title: 'Dashboard UI Concept',
        mediaType: 'image',
        filePath: '/assets/dashboard.png',
        prompt: 'Modern clean dashboard interface with dark mode theme',
        tags: ['ui', 'dashboard', 'darkmode'],
        sizeBytes: 102400
      });

      expect(item.id).toBe('asset-ui');
      expect(gallery.getItem('asset-ui')).toBeDefined();
    });

    it('should search indexed items by keyword search term and tags', () => {
      gallery.indexItem({
        id: 'g1',
        title: 'Abstract Blue Artwork',
        mediaType: 'image',
        filePath: '/tmp/g1.png',
        prompt: 'Vibrant blue watercolors',
        tags: ['art', 'blue'],
        sizeBytes: 500
      });
      gallery.indexItem({
        id: 'g2',
        title: 'Podcast Episode Intro',
        mediaType: 'audio',
        filePath: '/tmp/g2.mp3',
        prompt: 'Upbeat electronic synthesizer music',
        tags: ['audio', 'music'],
        sizeBytes: 2000
      });

      const searchRes1 = gallery.search({ searchTerm: 'watercolors' });
      expect(searchRes1.total).toBe(1);
      expect(searchRes1.items[0].id).toBe('g1');

      const searchRes2 = gallery.search({ mediaType: 'audio' });
      expect(searchRes2.total).toBe(1);
      expect(searchRes2.items[0].id).toBe('g2');
    });

    it('should compute gallery statistics and tag list', () => {
      gallery.indexItem({ id: '1', title: 'A', mediaType: 'image', filePath: '/a.png', tags: ['t1'], sizeBytes: 100 });
      gallery.indexItem({ id: '2', title: 'B', mediaType: 'video', filePath: '/b.mp4', tags: ['t2'], sizeBytes: 500 });

      const stats = gallery.getStats();
      expect(stats.totalAssets).toBe(2);
      expect(stats.totalSizeBytes).toBe(600);
      expect(stats.byType['image']).toBe(1);
      expect(stats.byType['video']).toBe(1);

      const tags = gallery.getAllTags();
      expect(tags).toEqual(['t1', 't2']);
    });
  });

  // Step 060: Media Suite Verification Test Bench
  describe('Step 060: MediaTestBench', () => {
    it('should run comprehensive verification suite and return passing report', async () => {
      const bench = new MediaTestBench(path.join(tempDir, 'bench_run'));
      const report = await bench.runVerificationSuite();

      expect(report.overallStatus).toBe('PASSED');
      expect(report.totalTests).toBe(6);
      expect(report.passed).toBe(6);
      expect(report.failed).toBe(0);
      expect(report.results.every(r => r.passed)).toBe(true);
    });
  });
});
