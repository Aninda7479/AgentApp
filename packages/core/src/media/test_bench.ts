import * as fs from 'fs';
import * as path from 'path';
import { MediaExporter } from './exporter.js';
import { VisionInputProcessor } from './vision_processor.js';
import { MediaQuotaMonitor } from './quota.js';
import { MediaJobPoller } from './poller.js';
import { MediaGalleryIndexer } from './gallery.js';

export interface TestCaseResult {
  name: string;
  step: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface VerificationReport {
  timestamp: number;
  totalTests: number;
  passed: number;
  failed: number;
  results: TestCaseResult[];
  overallStatus: 'PASSED' | 'FAILED';
}

export class MediaTestBench {
  private tempDir: string;

  constructor(tempDir?: string) {
    this.tempDir = tempDir || path.join(process.cwd(), '.test_media_bench_' + Date.now());
  }

  async runVerificationSuite(): Promise<VerificationReport> {
    if (!fs.existsSync(this.tempDir)) {
      await fs.promises.mkdir(this.tempDir, { recursive: true });
    }

    const results: TestCaseResult[] = [];

    results.push(await this.verifyExporter());
    results.push(await this.verifyVisionProcessor());
    results.push(await this.verifyQuotaMonitor());
    results.push(await this.verifyPoller());
    results.push(await this.verifyGalleryIndexer());
    results.push(await this.verifyEndToEndWorkflow());

    // Cleanup temp directory
    try {
      await fs.promises.rm(this.tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.length - passedCount;

    return {
      timestamp: Date.now(),
      totalTests: results.length,
      passed: passedCount,
      failed: failedCount,
      results,
      overallStatus: failedCount === 0 ? 'PASSED' : 'FAILED'
    };
  }

  private async verifyExporter(): Promise<TestCaseResult> {
    const startTime = Date.now();
    const step = 'Step 055';
    const name = 'Media Artifact Exporter Utility Verification';
    try {
      const exporter = new MediaExporter();
      const testBuf = Buffer.from('TEST_EXPORTER_DATA');
      const exportDir = path.join(this.tempDir, 'export_test');
      const res = await exporter.exportAssetFromBuffer('exp_1', testBuf, 'sample.png', 'image', {
        targetDir: exportDir
      });

      if (!fs.existsSync(res.targetPath)) {
        throw new Error('Exported file does not exist on disk.');
      }

      return {
        step,
        name,
        passed: true,
        durationMs: Date.now() - startTime,
        details: { targetPath: res.targetPath, bytes: res.bytesExported }
      };
    } catch (err: unknown) {
      return {
        step,
        name,
        passed: false,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  private async verifyVisionProcessor(): Promise<TestCaseResult> {
    const startTime = Date.now();
    const step = 'Step 056';
    const name = 'Multimodal Vision Input Processor Verification';
    try {
      const processor = new VisionInputProcessor();
      const mockImgBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );

      const att = await processor.prepareAttachment({ buffer: mockImgBuffer, mimeType: 'image/png' });
      const msg = processor.formatPromptWithVision('Analyze this image', [att]);

      if (msg.content.length !== 2) {
        throw new Error(`Expected 2 content parts in vision message, got ${msg.content.length}`);
      }

      return {
        step,
        name,
        passed: true,
        durationMs: Date.now() - startTime,
        details: { attachmentId: att.id, mimeType: att.mimeType }
      };
    } catch (err: unknown) {
      return {
        step,
        name,
        passed: false,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  private async verifyQuotaMonitor(): Promise<TestCaseResult> {
    const startTime = Date.now();
    const step = 'Step 057';
    const name = 'Media Generation Rate Limit & Quota Monitor Verification';
    try {
      const quota = new MediaQuotaMonitor({ maxDailyBudget: 1.0, warningThresholdPercent: 50 });
      const check1 = quota.checkQuota('image', 'openai', { quality: 'hd' }); // $0.08
      if (!check1.allowed) {
        throw new Error('Check quota should allow under budget request.');
      }

      quota.recordUsage({
        mediaType: 'image',
        provider: 'openai',
        estimatedCost: 0.60
      });

      const check2 = quota.checkQuota('video', 'runway', { durationSeconds: 10 }); // 10 * 0.05 = $0.50 -> daily sum $1.10 > $1.0
      if (check2.allowed) {
        throw new Error('Check quota should disallow when budget is exceeded.');
      }

      return {
        step,
        name,
        passed: true,
        durationMs: Date.now() - startTime,
        details: { reason: check2.reason }
      };
    } catch (err: unknown) {
      return {
        step,
        name,
        passed: false,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  private async verifyPoller(): Promise<TestCaseResult> {
    const startTime = Date.now();
    const step = 'Step 058';
    const name = 'Async Media Job Status Poller Verification';
    try {
      const poller = new MediaJobPoller();
      poller.registerJob({
        jobId: 'job_test_1',
        mediaType: 'video',
        status: 'queued',
        createdAt: Date.now()
      });

      let fetchCount = 0;
      const result = await poller.pollJob('job_test_1', async () => {
        fetchCount += 1;
        if (fetchCount >= 2) {
          return { status: 'completed', resultUrl: 'https://example.com/video.mp4', progress: 100 };
        }
        return { status: 'processing', progress: 50 };
      }, { intervalMs: 10, timeoutMs: 2000 });

      if (result.status !== 'completed' || fetchCount < 2) {
        throw new Error('Poller failed to poll until completion.');
      }

      return {
        step,
        name,
        passed: true,
        durationMs: Date.now() - startTime,
        details: { finalStatus: result.status, fetchCount }
      };
    } catch (err: unknown) {
      return {
        step,
        name,
        passed: false,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  private async verifyGalleryIndexer(): Promise<TestCaseResult> {
    const startTime = Date.now();
    const step = 'Step 059';
    const name = 'Generated Media Asset Gallery Indexer Verification';
    try {
      const gallery = new MediaGalleryIndexer();
      gallery.indexItem({
        id: 'gal_1',
        title: 'Cyberpunk City Architecture',
        mediaType: 'image',
        filePath: '/tmp/cyberpunk.png',
        prompt: 'Futuristic metropolis at night',
        tags: ['scifi', 'city', 'neon'],
        sizeBytes: 2048500
      });

      const searchRes = gallery.search({ searchTerm: 'metropolis' });
      if (searchRes.total !== 1 || searchRes.items[0].id !== 'gal_1') {
        throw new Error('Gallery search failed to index or retrieve item.');
      }

      return {
        step,
        name,
        passed: true,
        durationMs: Date.now() - startTime,
        details: { totalIndexed: searchRes.total }
      };
    } catch (err: unknown) {
      return {
        step,
        name,
        passed: false,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  private async verifyEndToEndWorkflow(): Promise<TestCaseResult> {
    const startTime = Date.now();
    const step = 'Step 060';
    const name = 'End-to-End Media Suite Integration Workflow Verification';
    try {
      const quota = new MediaQuotaMonitor({ maxDailyBudget: 10.0 });
      const poller = new MediaJobPoller();
      const exporter = new MediaExporter();
      const gallery = new MediaGalleryIndexer();

      // 1. Quota Precheck
      const precheck = quota.checkQuota('image', 'openai');
      if (!precheck.allowed) throw new Error('Quota blocked end-to-end generation');

      // 2. Register & Poll Job
      const jobId = 'e2e_job_1';
      poller.registerJob({ jobId, mediaType: 'image', status: 'queued', createdAt: Date.now() });
      const completedJob = await poller.pollJob(jobId, async () => ({
        status: 'completed',
        resultBuffer: Buffer.from('E2E_IMAGE_MOCK_BYTES')
      }), { intervalMs: 5 });

      // 3. Record usage
      quota.recordUsage({ mediaType: 'image', provider: 'openai', estimatedCost: precheck.estimatedCost });

      // 4. Export asset
      const exportDir = path.join(this.tempDir, 'e2e_exports');
      const exportRes = await exporter.exportAssetFromBuffer(jobId, completedJob.resultBuffer!, 'hero.png', 'image', {
        targetDir: exportDir
      });

      // 5. Index in Gallery
      gallery.indexItem({
        id: jobId,
        title: 'Hero Image',
        mediaType: 'image',
        filePath: exportRes.targetPath,
        tags: ['e2e', 'hero'],
        sizeBytes: exportRes.bytesExported
      });

      const stats = gallery.getStats();
      if (stats.totalAssets !== 1) {
        throw new Error('E2E asset failed gallery indexing step.');
      }

      return {
        step,
        name,
        passed: true,
        durationMs: Date.now() - startTime,
        details: { exportedPath: exportRes.targetPath, galleryCount: stats.totalAssets }
      };
    } catch (err: unknown) {
      return {
        step,
        name,
        passed: false,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
}
