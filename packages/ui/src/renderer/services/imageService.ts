export type GpuBackend = 'cuda' | 'vulkan' | 'metal' | 'cpu';

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
}

export interface EngineStatus {
  installed: boolean;
  version?: string;
  backend?: GpuBackend;
  binary_path?: string;
  installed_at?: number;
  is_running: boolean;
  is_downloading: boolean;
  download_progress?: number;
  error?: string;
}

export interface UpdateInfo {
  current: string;
  latest: string;
  changelog?: string;
  download_url: string;
}

export type ModelFamily = 'flux' | 'sdxl' | 'sd35' | 'sd15' | 'custom';

export interface ImageModelInfo {
  id: string;
  name: string;
  family: ModelFamily;
  quantization: string;
  download_url: string;
  filename: string;
  size_bytes: number;
  vram_required_mb: number;
  default_steps: number;
  default_cfg: number;
  is_downloaded: boolean;
  local_path?: string;
  download_progress?: number;
  is_downloading: boolean;
  error?: string;
}

export interface GenerateImageRequest {
  prompt: string;
  negative_prompt?: string;
  model_id?: string;
  mode?: 'local' | 'cloud' | 'auto';
  width?: number;
  height?: number;
  steps?: number;
  cfg_scale?: number;
  seed?: number;
  sampler?: string;
}

export interface GenerateImageResponse {
  success: boolean;
  id: string;
  image_url: string;
  prompt: string;
  negative_prompt?: string;
  model_id: string;
  source: string;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  seed: number;
  generation_time_ms: number;
  created_at: number;
}

export interface GenerationRecord {
  id: string;
  created_at: number;
  prompt: string;
  negative_prompt?: string;
  model_id: string;
  source: string;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  seed: number;
  sampler?: string;
  generation_time_ms: number;
  image_filename: string;
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
  if (text.trim().startsWith('<')) {
    throw new Error(
      `Received HTML document instead of JSON from ${endpoint}. Ensure SuperAgent Core backend is running on port 1469.`
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch (err: any) {
    throw new Error(`Failed to parse JSON response from ${endpoint}: ${err.message}`);
  }
}

// ─── Engine API ─────────────────────────────────────────────────────────────

export async function getEngineStatus(): Promise<EngineStatus> {
  try {
    return await requestJson<EngineStatus>('/api/images/engine/status', { method: 'GET' });
  } catch (err) {
    console.error('Failed to get image engine status:', err);
    return { installed: false, is_running: false, is_downloading: false };
  }
}

export async function installEngine(backend?: GpuBackend): Promise<{ success: boolean; message: string }> {
  return await requestJson<{ success: boolean; message: string }>('/api/images/engine/install', {
    method: 'POST',
    body: JSON.stringify({ backend }),
  });
}

export async function updateEngine(): Promise<{ success: boolean; message: string }> {
  return await requestJson<{ success: boolean; message: string }>('/api/images/engine/update', {
    method: 'POST',
  });
}

export async function rollbackEngine(): Promise<{ success: boolean; message: string }> {
  return await requestJson<{ success: boolean; message: string }>('/api/images/engine/rollback', {
    method: 'POST',
  });
}

export async function uninstallEngine(): Promise<{ success: boolean; message: string }> {
  return await requestJson<{ success: boolean; message: string }>('/api/images/engine', {
    method: 'DELETE',
  });
}

export async function checkEngineUpdate(): Promise<UpdateInfo | null> {
  try {
    return await requestJson<UpdateInfo | null>('/api/images/engine/check-update', { method: 'GET' });
  } catch {
    return null;
  }
}

export async function getHardwareProfile(): Promise<HardwareProfile | null> {
  try {
    return await requestJson<HardwareProfile>('/api/images/hardware', { method: 'GET' });
  } catch (err) {
    console.error('Failed to get hardware profile:', err);
    return null;
  }
}

// ─── Models API ─────────────────────────────────────────────────────────────

export async function listImageModels(): Promise<ImageModelInfo[]> {
  try {
    return await requestJson<ImageModelInfo[]>('/api/images/models', { method: 'GET' });
  } catch (err) {
    console.error('Failed to list image models:', err);
    return [];
  }
}

export async function pullImageModel(modelId: string): Promise<{ success: boolean; message: string }> {
  return await requestJson<{ success: boolean; message: string }>('/api/images/models/pull', {
    method: 'POST',
    body: JSON.stringify({ model_id: modelId }),
  });
}

export async function deleteImageModel(modelId: string): Promise<{ success: boolean; message: string }> {
  return await requestJson<{ success: boolean; message: string }>(`/api/images/models/${encodeURIComponent(modelId)}`, {
    method: 'DELETE',
  });
}

export async function openModelsFolder(): Promise<{ success: boolean; path: string }> {
  return await requestJson<{ success: boolean; path: string }>('/api/images/models/open-dir', {
    method: 'POST',
  });
}

// ─── Generation API ─────────────────────────────────────────────────────────

export async function generateImage(req: GenerateImageRequest): Promise<GenerateImageResponse> {
  return await requestJson<GenerateImageResponse>('/api/images/generate', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function listGenerations(): Promise<GenerationRecord[]> {
  try {
    return await requestJson<GenerationRecord[]>('/api/images/generations', { method: 'GET' });
  } catch (err) {
    console.error('Failed to list image generations:', err);
    return [];
  }
}

export async function getGeneration(id: string): Promise<GenerationRecord | null> {
  try {
    return await requestJson<GenerationRecord>(`/api/images/generations/${encodeURIComponent(id)}`, { method: 'GET' });
  } catch {
    return null;
  }
}

export async function deleteGeneration(id: string): Promise<{ success: boolean }> {
  return await requestJson<{ success: boolean }>(`/api/images/generations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function getImageUrl(id: string): string {
  return `${getApiBaseUrl()}/api/images/generations/${encodeURIComponent(id)}/file`;
}
