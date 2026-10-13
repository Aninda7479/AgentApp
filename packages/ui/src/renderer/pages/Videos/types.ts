import { CameraMotionPreset } from '../../services/videoService';

export interface AspectRatioOption {
  label: string;
  width: number;
  height: number;
}

export interface CameraPresetOption {
  preset: CameraMotionPreset;
  label: string;
  iconName: string;
  description: string;
}

export interface AttachedReferenceMedia {
  file?: File;
  dataUrl: string;
  name: string;
  size: number;
  type: 'first_frame' | 'last_frame' | 'source_video';
}

export interface VideoModelOption {
  id: string;
  name: string;
  source: 'local' | 'cloud';
  providerId?: string;
  family?: string;
  quantization?: string;
  sizeBytes?: number;
  isDownloaded?: boolean;
  isDownloading?: boolean;
  modality?: string;
  inputModalities?: string[];
  outputModalities?: string[];
}

export interface AdvancedVideoSettingsState {
  numFrames: number;
  fps: number;
  steps: number;
  cfgScale: number;
  seed: number;
  isRandomSeed: boolean;
  motionScale: number;
  interpolate2x: boolean;
  negativePrompt: string;
}

export interface VideoExportOptions {
  format: 'mp4' | 'webm' | 'gif' | 'prores';
  fps?: number;
  scaleFactor?: number;
  speedMultiplier?: number;
}
