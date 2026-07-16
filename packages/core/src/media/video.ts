import { BYOKConfig } from '../types/agent.js';
import { hasRealMediaKey, NO_PROVIDER_MESSAGE } from './config.js';

export interface VideoGenerationOptions {
  prompt: string;
  model?: 'sora' | 'runway-gen3' | 'kling' | string;
  durationSeconds?: number;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  imagePromptUrl?: string;
}

export interface VideoGenerationJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  videoUrl?: string;
  previewImageUrl?: string;
  prompt: string;
  model: string;
  provider: string;
  durationSeconds: number;
  aspectRatio: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export class VideoGenerator {
  private jobs: Map<string, VideoGenerationJob> = new Map();

  async startJob(options: VideoGenerationOptions, config: BYOKConfig): Promise<VideoGenerationJob> {
    const jobId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const model = options.model || config.modelName || 'sora';
    const provider = config.provider || 'openai';
    const durationSeconds = options.durationSeconds || 5;
    const aspectRatio = options.aspectRatio || '16:9';

    if (!options.prompt || options.prompt.trim() === '') {
      const failedJob: VideoGenerationJob = {
        jobId,
        status: 'failed',
        progress: 0,
        prompt: '',
        model,
        provider,
        durationSeconds,
        aspectRatio,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        error: 'Video prompt cannot be empty'
      };
      this.jobs.set(jobId, failedJob);
      return failedJob;
    }

    if (hasRealMediaKey(config)) {
      try {
        const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        const response = await fetch(`${baseUrl}/video/generations`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            prompt: options.prompt,
            duration: durationSeconds,
            aspect_ratio: aspectRatio,
            image_url: options.imagePromptUrl
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          const failedJob: VideoGenerationJob = {
            jobId,
            status: 'failed',
            progress: 0,
            prompt: options.prompt,
            model,
            provider,
            durationSeconds,
            aspectRatio,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            error: `API video generation start failed with status ${response.status}: ${errText}`
          };
          this.jobs.set(jobId, failedJob);
          return failedJob;
        }

        const data = await response.json() as { id?: string; status?: string };
        const apiJobId = data.id || jobId;
        const initialJob: VideoGenerationJob = {
          jobId: apiJobId,
          status: 'processing',
          progress: 10,
          prompt: options.prompt,
          model,
          provider,
          durationSeconds,
          aspectRatio,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        this.jobs.set(apiJobId, initialJob);
        return initialJob;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const failedJob: VideoGenerationJob = {
          jobId,
          status: 'failed',
          progress: 0,
          prompt: options.prompt,
          model,
          provider,
          durationSeconds,
          aspectRatio,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          error: errorMessage
        };
        this.jobs.set(jobId, failedJob);
        return failedJob;
      }
    }

    // Explicit mock key → offline fixture (preserves existing mock behavior).
    if (config.apiKey === 'mock-key' || config.apiKey.includes('mock')) {
      const mockJob: VideoGenerationJob = {
        jobId,
        status: 'completed',
        progress: 100,
        videoUrl: `https://media.superagent.ai/video/${jobId}.mp4`,
        previewImageUrl: `https://media.superagent.ai/video/${jobId}_thumb.jpg`,
        prompt: options.prompt,
        model,
        provider,
        durationSeconds,
        aspectRatio,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      this.jobs.set(jobId, mockJob);
      return mockJob;
    }

    // No provider connected. Report a clear failure rather than returning a
    // fabricated `completed` job with a fake video URL — that would mislead the
    // user into thinking a generation actually happened (matches image/tts/stt).
    return {
      jobId,
      status: 'failed',
      progress: 0,
      prompt: options.prompt,
      model,
      provider,
      durationSeconds,
      aspectRatio,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      error: NO_PROVIDER_MESSAGE
    };
  }

  async getJobStatus(jobId: string, config: BYOKConfig): Promise<VideoGenerationJob> {
    const existing = this.jobs.get(jobId);

    if (hasRealMediaKey(config)) {
      try {
        const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        const response = await fetch(`${baseUrl}/video/generations/${jobId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`
          }
        });

        if (response.ok) {
          const data = await response.json() as {
            status?: 'pending' | 'processing' | 'completed' | 'failed';
            progress?: number;
            video_url?: string;
            preview_image_url?: string;
            error?: string;
          };

          const updatedJob: VideoGenerationJob = {
            jobId,
            status: data.status || existing?.status || 'processing',
            progress: data.progress !== undefined ? data.progress : (existing?.progress || 50),
            videoUrl: data.video_url || existing?.videoUrl,
            previewImageUrl: data.preview_image_url || existing?.previewImageUrl,
            prompt: existing?.prompt || '',
            model: existing?.model || 'sora',
            provider: existing?.provider || config.provider || 'openai',
            durationSeconds: existing?.durationSeconds || 5,
            aspectRatio: existing?.aspectRatio || '16:9',
            createdAt: existing?.createdAt || Date.now(),
            updatedAt: Date.now(),
            error: data.error || existing?.error
          };
          this.jobs.set(jobId, updatedJob);
          return updatedJob;
        }
      } catch {
        // Fallback to cached state on fetch error
      }
    }

    if (existing) {
      return existing;
    }

    return {
      jobId,
      status: 'failed',
      progress: 0,
      prompt: '',
      model: 'unknown',
      provider: config.provider || 'openai',
      durationSeconds: 0,
      aspectRatio: '16:9',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      error: 'Job not found'
    };
  }
}
