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

function getBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.protocol}//${window.location.host}`;
  }
  return 'http://localhost:1469';
}

export async function listPcbProjects(): Promise<PcbProjectMetadata[]> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/pcb/projects`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to list PCB projects: HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error('Error fetching PCB projects list:', err);
    return [];
  }
}

export async function getPcbProject(id: string): Promise<PcbProject | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/pcb/projects/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to load PCB project [${id}]: HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error(`Error loading PCB project ${id}:`, err);
    return null;
  }
}

export async function savePcbProject(project: PcbProject): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`${getBaseUrl()}/api/pcb/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(project),
  });
  if (!res.ok) {
    throw new Error(`Failed to save PCB project: HTTP ${res.status}`);
  }
  return await res.json();
}

export async function deletePcbProject(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${getBaseUrl()}/api/pcb/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to delete PCB project: HTTP ${res.status}`);
  }
  return await res.json();
}
