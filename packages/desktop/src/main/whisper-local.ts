/**
 * On-device speech-to-text using `@huggingface/transformers` (WASM/WebGPU ONNX Whisper).
 *
 * Runs in the Electron **main** process (Node). No native binary is bundled —
 * the model is downloaded once from the Hugging Face Hub into `modelDir` and
 * executed with WASM (CPU) or WebGPU when available. The transcription
 * result feeds the same `media-transcribe` flow as cloud STT, so the Composer's
 * mic experience is identical regardless of backend.
 *
 * NOTE: transformers.js is ESM-only and browser-API-heavy. It is kept
 * **external** to the esbuild bundle (see scripts/bundle-renderer / esbuild
 * config) so it is required() at runtime rather than inlined. First load
 * fetches the model weights (~40 MB for `tiny`) from the Hub — network is
 * needed at download time only; inference is fully offline.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import Module from 'module';
import { pathToFileURL } from 'url';
import { app } from 'electron';
import { getUserDataDirectory } from '@superagent/core';

// transformers.js is required lazily so a missing/blocked install can't break
// the rest of the main process at import time. The package isn't a build-time
// dependency (installed at runtime), so we shadow its type with `any`.
type TransformersModule = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transformers: TransformersModule | null = null;

// A CJS `require` bound to this module — works in the packaged app too.
const nodeRequire = createRequire(__filename);

// Install once: intercept `require('onnxruntime-node')` and return a harmless
// stub. transformers.js's Node build eagerly requires onnxruntime-node at import
// time; that native binding fails to load on machines without the MSVC runtime.
// We never want the native backend anyway (see loadTransformers), so stubbing it
// lets the Node build load while inference is routed to onnxruntime-web (WASM).
let ortNodeStubbed = false;
const stubOnnxRuntimeNode = (): void => {
  if (ortNodeStubbed) return;
  const M = Module as unknown as { _load: (req: string, ...rest: unknown[]) => unknown };
  const origLoad = M._load;
  M._load = function (request: string, ...rest: unknown[]) {
    if (request === 'onnxruntime-node') return {};
    return origLoad.call(this, request, ...rest);
  };
  ortNodeStubbed = true;
};

/**
 * Load transformers.js configured to use the **pure-WASM** ONNX backend
 * (`onnxruntime-web`) rather than the native `onnxruntime-node`.
 *
 * Why: `onnxruntime-node` ships a native `.node` binary that links against the
 * Microsoft Visual C++ runtime. On machines without that redistributable the
 * binding fails to load with a cryptic "The specified module could not be
 * found." WASM has **zero native dependencies**, so on-device Whisper works on
 * any machine, fully offline, without asking the user to install anything.
 *
 * The mechanics (all verified against transformers.js v3):
 *  - We stub `onnxruntime-node` (see stubOnnxRuntimeNode) so the Node build —
 *    which we WANT because only it does filesystem model caching — can load
 *    without touching the native binary.
 *  - We expose our pre-configured ORT via `globalThis[Symbol.for('onnxruntime')]`,
 *    the official hook transformers.js checks first, so inference uses WASM.
 *  - `env.wasm.wasmPaths` must point at the local `.wasm` files as a `file://`
 *    URL (Windows rejects bare drive paths), so nothing is fetched from a CDN.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadTransformers = async (): Promise<any> => {
  if (transformers) return transformers;

  stubOnnxRuntimeNode();

  const ortSpec = 'onnxruntime-web';
  const ort = nodeRequire(ortSpec);
  const ortDir = path.dirname(nodeRequire.resolve(ortSpec));
  // Trailing separator + file:// URL is required for the local .wasm loader.
  ort.env.wasm.wasmPaths = pathToFileURL(ortDir + path.sep).href;
  // The multi-threaded WASM pool relies on Web Workers, which are unreliable in
  // the Electron main process — single-threaded is robust and fast enough for
  // dictation-length clips.
  ort.env.wasm.numThreads = 1;
  (globalThis as any)[Symbol.for('onnxruntime')] = ort;

  // Node build (bare specifier) — has filesystem caching; onnxruntime-node is
  // stubbed above so its eager require can't crash.
  transformers = nodeRequire('@huggingface/transformers');
  return transformers;
};

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

// We always use the MULTILINGUAL model (not the `.en` variants). It handles
// English well AND accepts a language hint / auto-detect uniformly, so download
// and transcribe always reference the same repo (English-only models reject a
// language arg and would force a second download for non-English users).
const modelRepo = (size: WhisperSize): string => `Xenova/whisper-${size}`;

/** transformers.js caches a repo to `<cacheDir>/<repo>` — mirror that here. */
const repoDir = (modelDir: string, size: WhisperSize): string =>
  path.join(modelDir, ...modelRepo(size).split('/'));

// Module-level cache so the (heavy) pipeline is loaded once per session.
let cachedPipeline: any = null;
let cachedKey: string | null = null;
let downloadState: { size: WhisperSize; progress: number; statusText: string } | null = null;

/** Cache key incl. device — a WASM pipeline can't be reused for WebGPU. */
const cacheKey = (size: WhisperSize, device: string, modelDir: string): string =>
  `${device}|${size}|${modelDir}`;

const modelExists = (modelDir: string, size: WhisperSize): boolean => {
  const dir = repoDir(modelDir, size);
  try {
    return fs.existsSync(path.join(dir, 'config.json')) || fs.existsSync(path.join(dir, 'tokenizer.json'));
  } catch {
    return false;
  }
};

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

/**
 * Download + cache the Whisper model for `size` into `<modelDir>/Xenova/whisper-<size>`.
 * Reports progress via `onProgress` (0–100 + status text). Resolves once the
 * pipeline is loaded and ready for inference.
 */
export async function download(
  size: WhisperSize,
  modelDir: string = defaultModelDir(),
  onProgress?: (progress: number, statusText: string) => void
): Promise<void> {
  const t = await loadTransformers();
  // transformers.js reads these from process.env at import time.
  (t.env as any).allowLocalModels = false; // always fetch/cache from the Hub path below
  (t.env as any).localModelPath = modelDir;
  (t.env as any).cacheDir = modelDir;

  try {
    fs.mkdirSync(modelDir, { recursive: true });
  } catch {
    /* best-effort; pipeline() will report a clear error if unwritable */
  }

  downloadState = { size, progress: 0, statusText: 'Starting download…' };
  onProgress?.(0, downloadState.statusText);

  try {
    const pipe = await t.pipeline('automatic-speech-recognition', modelRepo(size), {
      // 'auto' is the only device that resolves under our ORT override — it maps
      // to the WASM execution provider (see loadTransformers). WebGPU/DirectML
      // aren't available in the Electron main process.
      device: 'auto',
      progress_callback: (p: any) => {
        if (p?.status && (p.status === 'progress' || p.status === 'download')) {
          const prog = typeof p.progress === 'number' ? Math.round(p.progress) : 0;
          const txt = p.file ? `Downloading ${path.basename(String(p.file))}…` : (p.status || 'Downloading…');
          downloadState = { size, progress: prog, statusText: txt };
          onProgress?.(prog, txt);
        }
      }
    });
    cachedPipeline = pipe;
    cachedKey = cacheKey(size, 'wasm', modelDir);
    downloadState = null;
    onProgress?.(100, 'Ready');
  } catch (err: unknown) {
    downloadState = null;
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Whisper download failed: ${msg}`);
  }
}

/**
 * Transcribe raw audio bytes. Accepts a WAV file or raw Float32 PCM; WebM/Opus
 * is decoded to Float32 at 16 kHz mono before inference. Returns plain text.
 */
export async function transcribe(
  audioBuffer: Buffer,
  opts: { size: WhisperSize; language: string; autoDetect: boolean; device: ComputeDevice; modelDir?: string }
): Promise<TranscribeResult> {
  const t = await loadTransformers();
  const modelDir = opts.modelDir || defaultModelDir();
  // Inference always runs on the WASM backend in the main process (see
  // loadTransformers); `opts.device` is currently informational.
  const key = cacheKey(opts.size, 'wasm', modelDir);
  let pipe = cachedPipeline;
  if (!pipe || cachedKey !== key) {
    (t.env as any).allowLocalModels = false;
    (t.env as any).localModelPath = modelDir;
    (t.env as any).cacheDir = modelDir;
    pipe = await t.pipeline('automatic-speech-recognition', modelRepo(opts.size), {
      device: 'auto'
    });
    cachedPipeline = pipe;
    cachedKey = key;
  }

  // Decode to Float32 PCM @16kHz mono (Whisper's expected sample rate).
  const float32 = decodeToFloat32(audioBuffer);

  const generateKwargs: Record<string, unknown> = { return_timestamps: false };
  // Multilingual model: pass a language hint only when the user fixed one
  // (auto-detect leaves it unset). It accepts any language, English included.
  if (!opts.autoDetect && opts.language) {
    generateKwargs.language = opts.language.slice(0, 2).toLowerCase();
  }

  const output = await pipe(float32, {
    chunk_length_s: 30,
    stride_length_s: 5,
    ...generateKwargs
  });

  const text = typeof output === 'string' ? output : (output?.text ?? '');
  return { text: text.trim() };
}

/** Remove the cached model for a size (frees disk space). */
export function deleteModel(size: WhisperSize, modelDir: string = defaultModelDir()): void {
  const dir = repoDir(modelDir, size);
  if (cachedKey && cachedKey.includes(`|${size}|${modelDir}`)) {
    cachedPipeline = null;
    cachedKey = null;
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore — surface via caller */
  }
}

/** Validate a chosen model directory is creatable/writable. */
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

/**
 * Minimal WAV decoder → Float32Array @16kHz mono. transformers.js accepts a
 * Float32Array directly (raw PCM), so we only need to handle WAV containers;
 * if the input isn't a RIFF/WAV header we pass it through as raw PCM and let
 * the pipeline reject with a clear error.
 */
function decodeToFloat32(buf: Buffer): Float32Array {
  if (buf.length < 12) return new Float32Array(0);
  const riff = buf.toString('ascii', 0, 4);
  const wave = buf.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    // Assume raw Float32 PCM already.
    const needed = Math.floor(buf.length / 4);
    const out = new Float32Array(needed);
    for (let i = 0; i < needed; i++) out[i] = buf.readFloatLE(i * 4);
    return out;
  }

  let offset = 12;
  let sampleRate = 16000;
  let channels = 1;
  let bits = 16;
  let dataStart = -1;
  let dataLen = 0;

  while (offset + 8 <= buf.length) {
    const chunk = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (chunk === 'fmt ') {
      const audioFormat = buf.readUInt16LE(offset + 8);
      channels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12);
      bits = buf.readUInt16LE(offset + 22);
      // audioFormat 1 = PCM. Other formats would need a full decoder; reject clearly.
      if (audioFormat !== 1) {
        throw new Error(`Unsupported WAV format ${audioFormat} (only PCM is supported).`);
      }
    } else if (chunk === 'data') {
      dataStart = offset + 8;
      dataLen = size;
      break;
    }
    offset += 8 + size + (size % 2); // chunks are word-aligned
  }

  if (dataStart < 0) throw new Error('Invalid WAV: no data chunk.');
  const bytesPerSample = bits / 8;
  const samples = Math.floor(dataLen / bytesPerSample);
  const pcm = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const pos = dataStart + i * bytesPerSample;
    let s = 0;
    if (bits === 16) s = buf.readInt16LE(pos) / 32768;
    else if (bits === 32) s = buf.readInt32LE(pos) / 2147483648;
    else if (bits === 8) s = (buf.readUInt8(pos) - 128) / 128;
    else s = 0;
    pcm[i] = s;
  }

  // Downmix to mono.
  let mono = pcm;
  if (channels > 1) {
    mono = new Float32Array(Math.floor(samples / channels));
    for (let i = 0; i < mono.length; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) sum += pcm[i * channels + c];
      mono[i] = sum / channels;
    }
  }

  // Resample to 16kHz mono if needed (naive linear interpolation).
  if (sampleRate === 16000 || mono.length === 0) return mono;
  const ratio = sampleRate / 16000;
  const outLen = Math.max(1, Math.floor(mono.length / ratio));
  const resampled = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(mono.length - 1, i0 + 1);
    const frac = src - i0;
    resampled[i] = mono[i0] * (1 - frac) + mono[i1] * frac;
  }
  return resampled;
}
