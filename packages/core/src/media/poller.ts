export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface MediaJob {
  jobId: string;
  mediaType: 'image' | 'audio' | 'video' | 'pdf' | 'ppt' | string;
  status: JobStatus;
  progress?: number;
  resultUrl?: string;
  resultBuffer?: Buffer;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PollerOptions {
  intervalMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export class MediaJobPoller {
  private jobs: Map<string, MediaJob> = new Map();

  /**
   * Register a new media generation job for polling tracking.
   */
  registerJob(jobInit: Omit<MediaJob, 'updatedAt'>): MediaJob {
    const job: MediaJob = {
      ...jobInit,
      updatedAt: Date.now()
    };
    this.jobs.set(job.jobId, job);
    return job;
  }

  /**
   * Fetch job status by ID.
   */
  getJob(jobId: string): MediaJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Update internal job record.
   */
  updateJob(jobId: string, updates: Partial<MediaJob>): MediaJob {
    const existing = this.jobs.get(jobId);
    if (!existing) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const updated: MediaJob = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    };
    this.jobs.set(jobId, updated);
    return updated;
  }

  /**
   * Cancel an ongoing background job.
   */
  cancelJob(jobId: string): boolean {
    const existing = this.jobs.get(jobId);
    if (!existing) {
      return false;
    }
    if (existing.status === 'completed' || existing.status === 'failed') {
      return false;
    }

    this.updateJob(jobId, { status: 'cancelled' });
    return true;
  }

  /**
   * Poll an external API until the media generation job is completed, failed, or cancelled.
   */
  async pollJob(
    jobId: string,
    statusFetcher: (jobId: string) => Promise<Partial<MediaJob>>,
    options: PollerOptions = {}
  ): Promise<MediaJob> {
    let job = this.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} must be registered before polling.`);
    }

    const intervalMs = options.intervalMs ?? 500;
    const timeoutMs = options.timeoutMs ?? 30000;
    const maxRetries = options.maxRetries ?? 3;

    const startTime = Date.now();
    let retryCount = 0;

    while (true) {
      job = this.getJob(jobId)!;

      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        return job;
      }

      if (Date.now() - startTime > timeoutMs) {
        return this.updateJob(jobId, {
          status: 'failed',
          error: `Polling timed out after ${timeoutMs}ms`
        });
      }

      try {
        const fetchResult = await statusFetcher(jobId);
        retryCount = 0; // reset retry counter on success
        job = this.updateJob(jobId, fetchResult);

        if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
          return job;
        }
      } catch (err: unknown) {
        retryCount += 1;
        const errMsg = err instanceof Error ? err.message : String(err);
        if (retryCount > maxRetries) {
          return this.updateJob(jobId, {
            status: 'failed',
            error: `Polling failed after ${maxRetries} consecutive fetch errors: ${errMsg}`
          });
        }
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  /**
   * List jobs filtered optionally by status.
   */
  listJobs(filterStatus?: JobStatus): MediaJob[] {
    const list = Array.from(this.jobs.values());
    if (filterStatus) {
      return list.filter((j) => j.status === filterStatus);
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Clear tracked jobs.
   */
  clear(): void {
    this.jobs.clear();
  }
}
