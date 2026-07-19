import { parentPort } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import Module from 'module';
import { pathToFileURL } from 'url';

if (!parentPort) {
  process.exit(1);
}

type TransformersModule = any;
let transformers: TransformersModule | null = null;
const nodeRequire = createRequire(__filename);

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

const loadTransformers = async (): Promise<any> => {
  if (transformers) return transformers;
  stubOnnxRuntimeNode();
  const ortSpec = 'onnxruntime-web';
  const ort = nodeRequire(ortSpec);
  const ortDir = path.dirname(nodeRequire.resolve(ortSpec));
  ort.env.wasm.wasmPaths = pathToFileURL(ortDir + path.sep).href;
  ort.env.wasm.numThreads = 1;
  (globalThis as any)[Symbol.for('onnxruntime')] = ort;
  transformers = nodeRequire('@huggingface/transformers');
  return transformers;
};

type WhisperSize = 'tiny' | 'base' | 'small' | 'medium' | 'large';

const modelRepo = (size: WhisperSize): string => `Xenova/whisper-${size}`;

let cachedPipeline: any = null;
let cachedKey: string | null = null;

const cacheKey = (size: WhisperSize, device: string, modelDir: string): string =>
  `${device}|${size}|${modelDir}`;

function decodeToFloat32(buf: Buffer): Float32Array {
  if (buf.length < 12) return new Float32Array(0);
  const riff = buf.toString('ascii', 0, 4);
  const wave = buf.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
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
      if (audioFormat !== 1) {
        throw new Error(`Unsupported WAV format ${audioFormat} (only PCM is supported).`);
      }
    } else if (chunk === 'data') {
      dataStart = offset + 8;
      dataLen = size;
      break;
    }
    offset += 8 + size + (size % 2);
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

  let mono = pcm;
  if (channels > 1) {
    mono = new Float32Array(Math.floor(samples / channels));
    for (let i = 0; i < mono.length; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) sum += pcm[i * channels + c];
      mono[i] = sum / channels;
    }
  }

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

parentPort.on('message', async (msg) => {
  if (!parentPort) return;
  const { type, id } = msg;

  if (type === 'transcribe') {
    try {
      const { buffer, opts } = msg;
      const audioBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      const t = await loadTransformers();
      const modelDir = opts.modelDir;
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

      const float32 = decodeToFloat32(audioBuf);
      const generateKwargs: Record<string, unknown> = { return_timestamps: false };
      if (!opts.autoDetect && opts.language) {
        generateKwargs.language = opts.language.slice(0, 2).toLowerCase();
      }

      const output = await pipe(float32, {
        chunk_length_s: 30,
        stride_length_s: 5,
        ...generateKwargs
      });

      const text = typeof output === 'string' ? output : (output?.text ?? '');
      parentPort.postMessage({ type: 'transcribe-success', id, text: text.trim() });
    } catch (err: any) {
      parentPort.postMessage({ type: 'transcribe-error', id, error: err?.message ?? String(err) });
    }
  } else if (type === 'download') {
    try {
      const { size, modelDir } = msg;
      const t = await loadTransformers();
      (t.env as any).allowLocalModels = false;
      (t.env as any).localModelPath = modelDir;
      (t.env as any).cacheDir = modelDir;

      try {
        fs.mkdirSync(modelDir, { recursive: true });
      } catch { /* ignore */ }

      const pipe = await t.pipeline('automatic-speech-recognition', modelRepo(size), {
        device: 'auto',
        progress_callback: (p: any) => {
          if (p?.status && (p.status === 'progress' || p.status === 'download')) {
            const prog = typeof p.progress === 'number' ? Math.round(p.progress) : 0;
            const txt = p.file ? `Downloading ${path.basename(String(p.file))}…` : (p.status || 'Downloading…');
            parentPort?.postMessage({ type: 'download-progress', id, progress: prog, statusText: txt });
          }
        }
      });

      cachedPipeline = pipe;
      cachedKey = cacheKey(size, 'wasm', modelDir);
      parentPort.postMessage({ type: 'download-success', id });
    } catch (err: any) {
      parentPort.postMessage({ type: 'download-error', id, error: err?.message ?? String(err) });
    }
  } else if (type === 'warmup') {
    try {
      const { size, modelDir } = msg;
      const t = await loadTransformers();
      const key = cacheKey(size, 'wasm', modelDir);
      if (!cachedPipeline || cachedKey !== key) {
        (t.env as any).allowLocalModels = false;
        (t.env as any).localModelPath = modelDir;
        (t.env as any).cacheDir = modelDir;
        const pipe = await t.pipeline('automatic-speech-recognition', modelRepo(size), {
          device: 'auto'
        });
        cachedPipeline = pipe;
        cachedKey = key;
      }
      parentPort.postMessage({ type: 'warmup-success', id });
    } catch (err: any) {
      parentPort.postMessage({ type: 'warmup-error', id, error: err?.message ?? String(err) });
    }
  }
});
