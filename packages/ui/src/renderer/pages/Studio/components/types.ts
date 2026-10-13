export type CameraMode = 'orbit' | 'walkthrough';

export type ShadingMode = 'textured' | 'clay' | 'wireframe' | 'normals';

export type EnvironmentPreset = 'neutral' | 'cyberpunk' | 'sunset' | 'space' | 'grid';

export interface TransformState {
  x: number;
  y: number;
  z: number;
}

export interface SceneNodeInfo {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  polyCount?: number;
  children?: SceneNodeInfo[];
}

export interface MeshStats {
  vertices: number;
  triangles: number;
  boundingBox: {
    width: number;
    height: number;
    depth: number;
  };
  drawCalls: number;
}

export interface StylePresetOption {
  id: string;
  label: string;
  category: 'world' | 'character' | 'prop' | 'cad';
  description: string;
  promptModifier: string;
}

export interface GeneratedModel {
  ok: boolean;
  disabled?: boolean;
  path?: string;
  format?: string;
  provider?: string;
  message?: string;
  polyCount?: number;
  vertexCount?: number;
}

export interface SavedModel {
  name: string;
  path: string;
  format: string;
  size: number;
  modified: number;
  polyCount?: number;
}
