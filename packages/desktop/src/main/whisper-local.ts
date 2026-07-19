import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { getUserDataDirectory } from '@superagent/core';

export type WhisperSize = 'tiny' | 'base' | 'small' | 'medium' | 'large';
export type ComputeDevice = 'cpu' | 'gpu' | 'auto';

export interface LocalWhisperStatus {
  state: 'idle' | 'downloading' | 'ready' | 'error';
  /** 0–100 while downloading. */
  progress: number;
  statusText: string;
  modelDir: string;
  size?: WhisperSize;
}

export interface TranscribeResult {
  text: string;
}

export const DEFAULT_MODEL_SUBPATH = path.join('models', 'whisper');

/** Default cache location: `~/.superagent/models/whisper`. */
export function defaultModelDir(): string {
  return path.join(getUserDataDirectory(), DEFAULT_MODEL_SUBPATH);
}

const modelRepo = (size: WhisperSize): string => `Xenova/whisper-${size}`;

/** transformers.js caches a repo to `<cacheDir>/<repo>` — mirror that here. */
const repoDir = (modelDir: string, size: WhisperSize): string =>
  path.join(modelDir, ...modelRepo(size).split('/'));

const modelExists = (modelDir: string, size: WhisperSize): boolean => {
  const dir = repoDir(modelDir, size);
  try {
    return fs.existsSync(path.join(dir, 'config.json')) || fs.existsSync(path.join(dir, 'tokenizer.json'));
  } catch {
    return false;
  }
};

let cachedKey: string | null = null;
let downloadState: { size: WhisperSize; progress: number; statusText: string } | null = null;

let idleTimeout: NodeJS.Timeout | null = null;
const IDLE_UNLOAD_MS = 5 * 60 * 1000; // 5 minutes of inactivity unloads the model from RAM

let worker: Worker | null = null;
let nextJobId = 0;

interface PendingJob {
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
  onProgress?: (progress: number, statusText: string) => void;
}
const pendingJobs = new Map<string, PendingJob>();

function getOrCreateWorker(): Worker {
  if (worker) return worker;

  // The compiled JS file will be in dist/main/whisper-worker.js
  const workerPath = path.join(__dirname, 'whisper-worker.js');
  worker = new Worker(workerPath);

  worker.on('message', (msg: any) => {
    const { type, id } = msg;
    const job = pendingJobs.get(id);
    if (!job) return;

    if (type === 'transcribe-success') {
      pendingJobs.delete(id);
      job.resolve({ text: msg.text });
    } else if (type === 'transcribe-error') {
      pendingJobs.delete(id);
      job.reject(new Error(msg.error));
    } else if (type === 'download-progress') {
      job.onProgress?.(msg.progress, msg.statusText);
    } else if (type === 'download-success') {
      pendingJobs.delete(id);
      job.resolve();
    } else if (type === 'download-error') {
      pendingJobs.delete(id);
      job.reject(new Error(msg.error));
    } else if (type === 'warmup-success') {
      pendingJobs.delete(id);
      job.resolve();
    } else if (type === 'warmup-error') {
      pendingJobs.delete(id);
      job.reject(new Error(msg.error));
    }
  });

  worker.on('error', (err) => {
    console.error('Whisper worker error:', err);
    for (const [_, job] of pendingJobs.entries()) {
      job.reject(err);
    }
    pendingJobs.clear();
    worker = null;
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.warn(`Whisper worker exited with code ${code}`);
    }
    for (const [_, job] of pendingJobs.entries()) {
      job.reject(new Error(`Worker exited unexpectedly with code ${code}`));
    }
    pendingJobs.clear();
    worker = null;
  });

  return worker;
}

function resetIdleTimer(): void {
  if (idleTimeout) {
    clearTimeout(idleTimeout);
    idleTimeout = null;
  }
  idleTimeout = setTimeout(() => {
    void freePipeline();
  }, IDLE_UNLOAD_MS);
}

export async function freePipeline(): Promise<void> {
  if (idleTimeout) {
    clearTimeout(idleTimeout);
    idleTimeout = null;
  }
  if (worker) {
    try {
      await worker.terminate();
    } catch (err) {
      console.error('Failed to terminate Whisper worker:', err);
    }
    worker = null;
  }
  pendingJobs.clear();
  cachedKey = null;
}

const cacheKey = (size: WhisperSize, device: string, modelDir: string): string =>
  `${device}|${size}|${modelDir}`;

export function getStatus(size: WhisperSize, modelDir: string = defaultModelDir()): LocalWhisperStatus {
  if (downloadState && downloadState.size === size) {
    return {
      state: 'downloading',
      progress: downloadState.progress,
      statusText: downloadState.statusText,
      modelDir,
      size
    };
  }
  if (modelExists(modelDir, size)) {
    return { state: 'ready', progress: 100, statusText: 'Ready', modelDir, size };
  }
  return { state: 'idle', progress: 0, statusText: 'Not downloaded', modelDir, size };
}

export async function download(
  size: WhisperSize,
  modelDir: string = defaultModelDir(),
  onProgress?: (progress: number, statusText: string) => void
): Promise<void> {
  try {
    fs.mkdirSync(modelDir, { recursive: true });
  } catch { /* ignore */ }

  const id = `job_${nextJobId++}`;
  const w = getOrCreateWorker();

  downloadState = { size, progress: 0, statusText: 'Starting download…' };
  onProgress?.(0, downloadState.statusText);

  return new Promise<void>((resolve, reject) => {
    pendingJobs.set(id, {
      resolve: () => {
        downloadState = null;
        cachedKey = cacheKey(size, 'wasm', modelDir);
        resetIdleTimer();
        onProgress?.(100, 'Ready');
        resolve();
      },
      reject: (err) => {
        downloadState = null;
        reject(err);
      },
      onProgress: (progress, statusText) => {
        downloadState = { size, progress, statusText };
        onProgress?.(progress, statusText);
      }
    });

    w.postMessage({ type: 'download', id, size, modelDir });
  });
}

export async function transcribe(
  audioBuffer: Buffer,
  opts: { size: WhisperSize; language: string; autoDetect: boolean; device: ComputeDevice; modelDir?: string }
): Promise<TranscribeResult> {
  const modelDir = opts.modelDir || defaultModelDir();
  const id = `job_${nextJobId++}`;
  const w = getOrCreateWorker();

  const jobPromise = new Promise<TranscribeResult>((resolve, reject) => {
    pendingJobs.set(id, {
      resolve,
      reject
    });
  });

  w.postMessage({
    type: 'transcribe',
    id,
    buffer: audioBuffer,
    opts: {
      size: opts.size,
      language: opts.language,
      autoDetect: opts.autoDetect,
      modelDir
    }
  });

  const res = await jobPromise;
  resetIdleTimer();
  return res;
}

export async function deleteModel(size: WhisperSize, modelDir: string = defaultModelDir()): Promise<void> {
  const dir = repoDir(modelDir, size);
  if (cachedKey && cachedKey.includes(`|${size}|${modelDir}`)) {
    await freePipeline();
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

export function validateModelDir(dir: string): { ok: boolean; error?: string } {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Cannot use that location: ${msg}` };
  }
}

export async function warmup(
  size: WhisperSize,
  modelDir: string = defaultModelDir()
): Promise<void> {
  const id = `job_${nextJobId++}`;
  const w = getOrCreateWorker();

  return new Promise<void>((resolve, reject) => {
    pendingJobs.set(id, {
      resolve: () => {
        cachedKey = cacheKey(size, 'wasm', modelDir);
        resolve();
      },
      reject
    });

    w.postMessage({ type: 'warmup', id, size, modelDir });
  });
}
