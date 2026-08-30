import { PCBGraph } from '../pages/PCB/types';
import { PCBSettingsConfig } from '../pages/PCB/hardwareAiEngine';

export interface PcbChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  actionDiff?: {
    addedComponents?: string[];
    modifiedNets?: string[];
    explanation?: string;
  };
}

export interface PcbProject {
  id: string;
  name: string;
  revision: string;
  description?: string;
  created_at: number;
  updated_at: number;
  graph: PCBGraph;
  messages: PcbChatMessage[];
  settings?: PCBSettingsConfig;
  tags?: string[];
}

export interface PcbProjectMetadata {
  id: string;
  name: string;
  revision: string;
  description?: string;
  created_at: number;
  updated_at: number;
  components_count: number;
  nets_count: number;
  message_count: number;
  tags: string[];
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
      const errJson = await res.json();
      if (errJson && (errJson.message || errJson.error)) {
        errorMsg = errJson.message || errJson.error;
      }
    } catch {
      const errText = await res.text().catch(() => '');
      if (errText) errorMsg = errText;
    }
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

export async function listPcbProjects(): Promise<PcbProjectMetadata[]> {
  try {
    return await requestJson<PcbProjectMetadata[]>('/api/pcb/projects', {
      method: 'GET',
    });
  } catch (err) {
    console.error('Error fetching PCB projects list:', err);
    return [];
  }
}

export async function getPcbProject(id: string): Promise<PcbProject | null> {
  try {
    return await requestJson<PcbProject>(`/api/pcb/projects/${encodeURIComponent(id)}`, {
      method: 'GET',
    });
  } catch (err) {
    console.error(`Error loading PCB project ${id}:`, err);
    return null;
  }
}

export async function savePcbProject(project: PcbProject): Promise<{ success: boolean; id: string }> {
  return await requestJson<{ success: boolean; id: string }>('/api/pcb/projects', {
    method: 'POST',
    body: JSON.stringify(project),
  });
}

export async function deletePcbProject(id: string): Promise<{ success: boolean }> {
  return await requestJson<{ success: boolean }>(`/api/pcb/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
