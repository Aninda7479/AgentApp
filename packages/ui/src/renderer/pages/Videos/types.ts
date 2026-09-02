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
  type: 'first_frame' | 'last_frame';
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
