export type GpuBackend = 'cuda' | 'vulkan' | 'metal' | 'rocm' | 'cpu';

export interface HardwareProfile {
  os: string;
  arch: string;
  gpu_name?: string;
  vram_mb?: number;
  total_ram_mb: number;
  available_ram_mb?: number;
  recommended_backend: GpuBackend;
  recommended_model_id: string;
  storage_free_gb?: number;
  storage_total_gb?: number;
  storage_mount?: string;
  npu_detected?: boolean;
  npu_label?: string;
  ffmpeg_installed: boolean;
  ffmpeg_version?: string;
}

export interface VideoEngineStatus {
  installed: boolean;
  version?: string;
  backend?: GpuBackend;
  binary_path?: string;
  installed_at?: number;
  is_running: boolean;
  is_downloading: boolean;
  download_progress?: number;
  error?: string;
  ffmpeg_ready: boolean;
}

export interface VideoUpdateInfo {
  current: string;
  latest: string;
  changelog?: string;
  download_url: string;
}

export type VideoModelFamily =
  | 'wan2_1'
  | 'ltx_video'
  | 'cog_video_x'
  | 'hunyuan_video'
  | 'stable_video_diffusion'
  | 'custom';

export type VideoModality = 'text_to_video' | 'image_to_video' | 'both';

export interface VideoModelInfo {
  id: string;
  name: string;
  family: VideoModelFamily;
  modality: VideoModality;
  quantization: string;
  download_url: string;
  filename: string;
  size_bytes: number;
  vram_required_mb: number;
  default_frames: number;
  default_fps: number;
  default_steps: number;
  default_cfg: number;
  is_downloaded: boolean;
  local_path?: string;
  download_progress?: number;
  is_downloading: boolean;
  error?: string;
}

export type CameraMotionPreset =
  | 'Static'
  | 'PanLeft'
  | 'PanRight'
  | 'TiltUp'
  | 'TiltDown'
  | 'ZoomIn'
  | 'ZoomOut'
  | 'OrbitLeft'
  | 'OrbitRight'
  | 'CraneUp';

export interface GenerateVideoRequest {
  prompt: string;
  negative_prompt?: string;
  model_id?: string;
  mode?: 'local' | 'cloud' | 'auto';
  width?: number;
  height?: number;
  num_frames?: number;
  fps?: number;
  steps?: number;
  cfg_scale?: number;
  seed?: number;
  motion_scale?: number;
  camera_motion?: CameraMotionPreset;
  init_image?: string;
  last_image?: string;
  interpolate_2x?: boolean;
  sampler?: string;
}

export interface GenerateVideoResponse {
  success: boolean;
  id: string;
  video_url: string;
  thumbnail_url: string;
  prompt: string;
  negative_prompt?: string;
  model_id: string;
  source: string;
  width: number;
  height: number;
  num_frames: number;
  fps: number;
  duration_seconds: number;
  steps: number;
  cfg_scale: number;
  seed: number;
  generation_time_ms: number;
  created_at: number;
}

export interface VideoGenerationRecord {
  id: string;
  created_at: number;
  prompt: string;
  negative_prompt?: string;
  model_id: string;
  source: string;
  width: number;
  height: number;
  num_frames: number;
  fps: number;
  duration_seconds: number;
  steps: number;
  cfg_scale: number;
  seed: number;
  motion_scale?: number;
  camera_motion?: string;
  sampler?: string;
  generation_time_ms: number;
  video_filename: string;
  thumbnail_filename: string;
}

export interface VideoProgressEvent {
  step: number;
  total_steps: number;
  frame_current: number;
  frame_total: number;
  progress: number;
  phase: string;
  step_time_ms?: number;
  eta_seconds?: number;
  elapsed_seconds: number;
  preview_data_url?: string;
}

export interface VideoExportRequest {
  format: 'mp4' | 'webm' | 'gif' | 'prores';
  fps?: number;
  scale_factor?: number;
  speed_multiplier?: number;
}

export interface VideoExportResponse {
  success: boolean;
  export_url: string;
  filename: string;
  size_bytes: number;
}

import { getAuthHeaders, getCoreApiBaseUrl } from '../lib/ipc';

export function getApiBaseUrl(): string {
  return getCoreApiBaseUrl();
}

async function requestJson<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint}`;
  const headers = getAuthHeaders((options.headers as Record<string, string>) || {});

  const res = await fetch(url, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('text/html')) {
    throw new Error(
      `Received HTML response instead of JSON from ${endpoint}. Ensure SuperAgent Core backend is running on port 1469.`
    );
  }

  if (!res.ok) {
    let errorMsg = `Failed request (${res.status})`;
    try {
      const text = await res.text();
      if (text) {
        try {
          const errJson = JSON.parse(text);
          if (errJson && (errJson.message || errJson.error)) {
            errorMsg = errJson.message || errJson.error;
          } else {
            errorMsg = text;
          }
        } catch {
          errorMsg = text;
        }
      }
    } catch {}
    throw new Error(errorMsg);
  }

  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch (err: any) {
    throw new Error(`Failed to parse JSON response from ${endpoint}: ${err.message}`);
  }
}

// ─── Engine API ─────────────────────────────────────────────────────────────

export async function getVideoEngineStatus(): Promise<VideoEngineStatus> {
  try {
    return await requestJson<VideoEngineStatus>('/api/videos/engine/status', { method: 'GET' });
  } catch (err) {
    console.error('Failed to get video engine status:', err);
    return { installed: false, is_running: false, is_downloading: false, ffmpeg_ready: false };
  }
}

export async function installVideoEngine(backend?: GpuBackend): Promise<{ success: boolean; message: string }> {
  return await requestJson<{ success: boolean; message: string }>('/api/videos/engine/install', {
    method: 'POST',
    body: JSON.stringify({ backend }),
  });
}

export async function updateVideoEngine(): Promise<{ success: boolean; message: string }> {
  return await requestJson<{ success: boolean; message: string }>('/api/videos/engine/update', {
    method: 'POST',
  });
}

export async function rollbackVideoEngine(): Promise<{ success: boolean; message: string }> {
  return await requestJson<{ success: boolean; message: string }>('/api/videos/engine/rollback', {
    method: 'POST',
  });
}

export async function uninstallVideoEngine(): Promise<{ success: boolean; message: string }> {
  return await requestJson<{ success: boolean; message: string }>('/api/videos/engine', {
    method: 'DELETE',
  });
}

export async function checkVideoEngineUpdate(): Promise<VideoUpdateInfo | null> {
  try {
    return await requestJson<VideoUpdateInfo | null>('/api/videos/engine/check-update', { method: 'GET' });
  } catch {
    return null;
  }
}

// ─── Hardware API ───────────────────────────────────────────────────────────

export async function getVideoHardwareProfile(): Promise<HardwareProfile> {
  return await requestJson<HardwareProfile>('/api/videos/hardware', { method: 'GET' });
}

// ─── Models API ─────────────────────────────────────────────────────────────

export async function listVideoModels(): Promise<VideoModelInfo[]> {
  try {
    return await requestJson<VideoModelInfo[]>('/api/videos/models', { method: 'GET' });
  } catch (err) {
    console.error('Failed to list video models:', err);
    return [];
  }
}

export async function pullVideoModel(modelId: string): Promise<{ success: boolean; message: string }> {
  return await requestJson<{ success: boolean; message: string }>('/api/videos/models/pull', {
    method: 'POST',
    body: JSON.stringify({ model_id: modelId }),
  });
}

export async function deleteVideoModel(modelId: string): Promise<{ success: boolean; message: string }> {
  return await requestJson<{ success: boolean; message: string }>(`/api/videos/models/${encodeURIComponent(modelId)}`, {
    method: 'DELETE',
  });
}

export async function openVideoModelsDir(): Promise<{ success: boolean; path: string }> {
  return await requestJson<{ success: boolean; path: string }>('/api/videos/models/open-dir', {
    method: 'POST',
  });
}

// ─── Generation API ─────────────────────────────────────────────────────────

export async function generateVideo(req: GenerateVideoRequest): Promise<GenerateVideoResponse> {
  return await requestJson<GenerateVideoResponse>('/api/videos/generate', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function generateVideoStream(
  req: GenerateVideoRequest,
  onProgress?: (progress: VideoProgressEvent) => void,
  signal?: AbortSignal
): Promise<GenerateVideoResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/videos/generate/stream`;
  const headers = getAuthHeaders({ 'Content-Type': 'application/json' });

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok) {
    let errorMsg = `Failed video generation (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson && (errJson.message || errJson.error)) {
        errorMsg = errJson.message || errJson.error;
      }
    } catch {}
    throw new Error(errorMsg);
  }

  if (!res.body) {
    return await generateVideo(req);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: GenerateVideoResponse | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          currentEvent = '';
          continue;
        }

        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim();
        } else if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim();
          try {
            const dataObj = JSON.parse(dataStr);
            if (currentEvent === 'progress' || dataObj.progress !== undefined) {
              if (onProgress) {
                onProgress(dataObj as VideoProgressEvent);
              }
            } else if (currentEvent === 'complete' || dataObj.video_url || dataObj.id) {
              finalResult = dataObj as GenerateVideoResponse;
            } else if (currentEvent === 'error') {
              throw new Error(dataObj.message || dataObj.error || 'Video generation failed');
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('Unexpected token')) {
              throw e;
            }
          }
        }
      }
    }
  } catch (err: any) {
    if (signal?.aborted) {
      throw new Error('Video generation canceled.');
    }
    throw err;
  }

  if (finalResult) {
    return finalResult;
  }

  throw new Error('Video stream ended without a complete result payload.');
}

export async function listVideoGenerations(): Promise<VideoGenerationRecord[]> {
  try {
    return await requestJson<VideoGenerationRecord[]>('/api/videos/generations', { method: 'GET' });
  } catch (err) {
    console.error('Failed to list video generations:', err);
    return [];
  }
}

import { getStoredAuthToken } from '../lib/ipc';

export async function getVideoGeneration(id: string): Promise<VideoGenerationRecord> {
  return await requestJson<VideoGenerationRecord>(`/api/videos/generations/${encodeURIComponent(id)}`, {
    method: 'GET',
  });
}

export function getVideoUrl(id: string): string {
  const baseUrl = getApiBaseUrl();
  const token = getStoredAuthToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${baseUrl}/api/videos/generations/${encodeURIComponent(id)}/file${query}`;
}

export function getVideoThumbnailUrl(id: string): string {
  const baseUrl = getApiBaseUrl();
  const token = getStoredAuthToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${baseUrl}/api/videos/generations/${encodeURIComponent(id)}/thumbnail${query}`;
}


export async function deleteVideoGeneration(id: string): Promise<{ success: boolean }> {
  return await requestJson<{ success: boolean }>(`/api/videos/generations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function exportVideo(
  id: string,
  req: VideoExportRequest
): Promise<VideoExportResponse> {
  return await requestJson<VideoExportResponse>(`/api/videos/generations/${encodeURIComponent(id)}/export`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}
