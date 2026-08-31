export interface AspectRatioOption {
  label: string;
  width: number;
  height: number;
}

export interface AttachedReferenceImage {
  name: string;
  dataUrl: string;
  sizeBytes?: number;
  strength: number; // 0.1 to 0.9, default ~0.65
}

export type BrandLogoPlacement =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface BrandLogoConfig {
  enabled: boolean;
  source: 'superagent' | 'custom';
  customDataUrl?: string;
  customFileName?: string;
  placement: BrandLogoPlacement;
  opacity: number; // 0.1 to 1.0, default 0.85
  scale: number; // 0.1 to 0.5 relative size, default 0.18
}

export interface ColorPaletteConfig {
  id: string;
  name: string;
  colors: string[]; // hex codes e.g. ["#00f5d4", "#7b2cbf", "#ff007f"]
  description?: string;
}

export interface StylePreset {
  id: string;
  label: string;
  iconName?: string;
  promptSuffix: string;
  negativeSuffix?: string;
  suggestedCfg?: number;
  suggestedSteps?: number;
}

export interface AdvancedSettingsState {
  steps: number;
  cfgScale: number;
  seed: number | null;
  sampler: string;
  negativePrompt: string;
  mode: 'auto' | 'local' | 'cloud';
}

export interface GenerationStepProgress {
  step: number;
  totalSteps: number;
  progress: number; // 0.0 to 1.0
  phase: string;
  stepTimeMs?: number;
  etaSeconds?: number;
  elapsedSeconds: number;
  previewDataUrl?: string;
  previewUrl?: string;
}
