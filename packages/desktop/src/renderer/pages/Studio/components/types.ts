export interface GeneratedModel {
  ok: boolean;
  disabled?: boolean;
  path?: string;
  format?: string;
  provider?: string;
  message?: string;
}

export interface SavedModel {
  name: string;
  path: string;
  format: string;
  size: number;
  modified: number;
}

export interface TransformState {
  x: number;
  y: number;
  z: number;
}

export interface Stage {
  id: number;
  label: string;
  Icon: React.ComponentType<any>;
  desc: string;
}
