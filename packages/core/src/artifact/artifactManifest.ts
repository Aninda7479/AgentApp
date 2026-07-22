/**
 * Manifest definition and types for SuperAgent local micro-apps / artifacts.
 * Stored at: ~/.superagent/artifact/<artifact-id>/manifest.json
 */

export type ArtifactType = 'static' | 'node' | 'python';

export type ArtifactStatusType = 'stopped' | 'running' | 'error' | 'starting';

export interface ArtifactManifest {
  /** Unique ID matching folder name, e.g. "quick-calc" */
  id: string;
  /** Human-readable title */
  name: string;
  /** Short description of the micro-app */
  description: string;
  /** Version string, e.g. "1.0.0" */
  version: string;
  /** Relative logo file path or data URI, e.g. "logo.png" or "icon.svg" */
  logo?: string;
  /** Type of execution engine */
  type: ArtifactType;
  /** Main entry file relative to artifact directory, e.g. "index.html" or "server.js" */
  entry: string;
  /** Target HTTP port for static/web servers */
  port?: number;
  /** Environment variables to pass during process start */
  env?: Record<string, string>;
  /** Automatically start this artifact when SuperAgent launches */
  autoStart?: boolean;
  /** Creation timestamp (ISO string) */
  createdAt: string;
  /** Category or tags */
  tags?: string[];
}

export interface ArtifactRuntimeState {
  id: string;
  manifest: ArtifactManifest;
  status: ArtifactStatusType;
  actualPort?: number;
  url?: number | string;
  pid?: number;
  errorMessage?: string;
  startedAt?: string;
}

export interface CreateArtifactParams {
  id: string;
  name: string;
  description: string;
  type?: ArtifactType;
  entry?: string;
  port?: number;
  files: Record<string, string>;
  logo?: string;
}

/**
 * Validates whether a given object is a valid ArtifactManifest.
 */
export function isValidArtifactManifest(obj: unknown): obj is ArtifactManifest {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  const item = obj as Partial<ArtifactManifest>;
  if (typeof item.id !== 'string' || !item.id.trim()) {
    return false;
  }
  if (typeof item.name !== 'string' || !item.name.trim()) {
    return false;
  }
  if (typeof item.entry !== 'string' || !item.entry.trim()) {
    return false;
  }
  const validTypes: ArtifactType[] = ['static', 'node', 'python'];
  if (!item.type || !validTypes.includes(item.type)) {
    return false;
  }
  return true;
}
