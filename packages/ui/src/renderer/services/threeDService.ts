export type GpuBackend = 'cuda' | 'vulkan' | 'metal' | 'rocm' | 'cpu';

export type ThreeDModality =
  | 'text_to_3d'
  | 'image_to_3d'
  | 'world_gen'
  | 'character_avatar'
  | 'cad_solid';

export type ThreeDOutputFormat = 'glb' | 'gltf' | 'obj' | 'ply' | 'stl' | 'threemf' | 'usdz';

export type ThreeDModelFamily =
  | 'trellis'
  | 'hunyuan3d'
  | 'triposr'
  | 'tripo3d'
  | 'meshy'
  | 'shape'
  | 'openai_astra'
  | 'procedural'
  | 'custom';

export interface ThreeDHardwareProfile {
  os: string;
  arch: string;
  gpu_name?: string;
  vram_mb?: number;
  total_ram_mb: number;
  available_ram_mb?: number;
  recommended_backend: GpuBackend;
  recommended_model_id: string;
  mesh_compute_supported: boolean;
  splatting_supported: boolean;
}

export interface ThreeDEngineStatus {
  installed: boolean;
  version?: string;
  backend?: GpuBackend;
  binary_path?: string;
  is_running: boolean;
  is_downloading: boolean;
  download_progress?: number;
  error?: string;
}

export interface ThreeDModelInfo {
  id: string;
  name: string;
  family: ThreeDModelFamily;
  modality: ThreeDModality;
  supported_formats: ThreeDOutputFormat[];
  size_bytes: number;
  vram_required_mb: number;
  is_downloaded: boolean;
  download_url: string;
  download_progress?: number;
  is_downloading: boolean;
  local_path?: string;
  error?: string;
}

export interface SpatialWorldConfig {
  theme?: string;
  room_width?: number;
  room_length?: number;
  room_height?: number;
  density?: number;
  include_lighting?: boolean;
  skybox?: string;
}

export interface Generate3DRequest {
  prompt: string;
  negative_prompt?: string;
  model_id?: string;
  mode?: 'local' | 'cloud' | 'auto';
  modality?: ThreeDModality;
  output_format?: ThreeDOutputFormat;
  init_image?: string;
  poly_budget?: number;
  texture_resolution?: number;
  seed?: number;
  geometry_style?: string;
  spatial_world?: SpatialWorldConfig;
}

export interface Generate3DResponse {
  success: boolean;
  id: string;
  model_url: string;
  thumbnail_url?: string;
  prompt: string;
  model_id: string;
  source: string;
  format: ThreeDOutputFormat;
  poly_count?: number;
  vertex_count?: number;
  generation_time_ms: number;
  created_at: number;
  metadata: Record<string, unknown>;
}

export interface ThreeDGenerationRecord {
  id: string;
  created_at: number;
  prompt: string;
  negative_prompt?: string;
  model_id: string;
  source: string;
  format: ThreeDOutputFormat;
  poly_count?: number;
  vertex_count?: number;
  generation_time_ms: number;
  file_name: string;
  thumbnail_name?: string;
  metadata: Record<string, unknown>;
}

export interface ThreeDProgressEvent {
  id?: string;
  step: number;
  total_steps: number;
  stage: string;
  percentage: number;
  message: string;
  result?: Generate3DResponse;
  error?: string;
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse JSON response from ${endpoint}: ${msg}`);
  }
}

// ─── Engine API ─────────────────────────────────────────────────────────────

export async function getThreeDEngineStatus(): Promise<ThreeDEngineStatus> {
  try {
    return await requestJson<ThreeDEngineStatus>('/api/threed/engine/status', { method: 'GET' });
  } catch (err) {
    console.error('Failed to get 3D engine status:', err);
    return { installed: true, is_running: true, is_downloading: false };
  }
}

export async function installThreeDEngine(
  backend?: GpuBackend
): Promise<{ success: boolean; message: string }> {
  return await requestJson<{ success: boolean; message: string }>('/api/threed/engine/install', {
    method: 'POST',
    body: JSON.stringify({ backend }),
  });
}

export async function getThreeDHardwareProfile(): Promise<ThreeDHardwareProfile | null> {
  try {
    return await requestJson<ThreeDHardwareProfile>('/api/threed/hardware', { method: 'GET' });
  } catch (err) {
    console.error('Failed to get 3D hardware profile:', err);
    return null;
  }
}

// ─── Models API ─────────────────────────────────────────────────────────────

export async function listThreeDModels(): Promise<ThreeDModelInfo[]> {
  try {
    return await requestJson<ThreeDModelInfo[]>('/api/threed/models', { method: 'GET' });
  } catch (err) {
    console.error('Failed to list 3D models:', err);
    return [];
  }
}

export async function pullThreeDModel(
  modelId: string
): Promise<{ success: boolean; message: string }> {
  return await requestJson<{ success: boolean; message: string }>('/api/threed/models/pull', {
    method: 'POST',
    body: JSON.stringify({ model_id: modelId }),
  });
}

export async function deleteThreeDModel(modelId: string): Promise<{ success: boolean }> {
  return await requestJson<{ success: boolean }>(
    `/api/threed/models/${encodeURIComponent(modelId)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function openThreeDModelsDir(): Promise<{ success: boolean; path: string }> {
  return await requestJson<{ success: boolean; path: string }>('/api/threed/models/open-dir', {
    method: 'POST',
  });
}

// ─── Generation API ─────────────────────────────────────────────────────────

export async function generateThreeD(req: Generate3DRequest): Promise<Generate3DResponse> {
  return await requestJson<Generate3DResponse>('/api/threed/generate', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function generateThreeDStream(
  req: Generate3DRequest,
  onProgress: (event: ThreeDProgressEvent) => void,
  abortSignal?: AbortSignal
): Promise<Generate3DResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/threed/generate/stream`;
  const headers = getAuthHeaders({ 'Content-Type': 'application/json' });

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
    signal: abortSignal,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`3D Generation failed (${res.status}): ${errorText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('Failed to read response stream from 3D generator.');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: Generate3DResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data:')) {
        try {
          const raw = line.slice(5).trim();
          if (!raw) continue;
          const data = JSON.parse(raw) as ThreeDProgressEvent;
          onProgress(data);
          if (data.result) {
            finalResult = data.result;
          }
        } catch {}
      }
    }
  }

  if (finalResult) {
    return finalResult;
  }

  // If no final result received via stream, fetch latest generation record
  const recs = await listThreeDGenerations();
  if (recs.length > 0) {
    const latest = recs[0];
    return {
      success: true,
      id: latest.id,
      model_url: getThreeDModelFileUrl(latest.id),
      prompt: latest.prompt,
      model_id: latest.model_id,
      source: latest.source,
      format: latest.format,
      poly_count: latest.poly_count,
      vertex_count: latest.vertex_count,
      generation_time_ms: latest.generation_time_ms,
      created_at: latest.created_at,
      metadata: latest.metadata,
    };
  }

  throw new Error('3D generation stream ended without returning a model.');
}

// ─── Generations Storage API ────────────────────────────────────────────────

export async function listThreeDGenerations(): Promise<ThreeDGenerationRecord[]> {
  try {
    return await requestJson<ThreeDGenerationRecord[]>('/api/threed/generations', {
      method: 'GET',
    });
  } catch (err) {
    console.error('Failed to list 3D generations:', err);
    return [];
  }
}

export async function getThreeDGeneration(id: string): Promise<ThreeDGenerationRecord | null> {
  try {
    return await requestJson<ThreeDGenerationRecord>(
      `/api/threed/generations/${encodeURIComponent(id)}`,
      { method: 'GET' }
    );
  } catch {
    return null;
  }
}

export async function deleteThreeDGeneration(id: string): Promise<{ success: boolean }> {
  return await requestJson<{ success: boolean }>(
    `/api/threed/generations/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    }
  );
}

export function getThreeDModelFileUrl(id: string): string {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/api/threed/generations/${encodeURIComponent(id)}/file`;
}
