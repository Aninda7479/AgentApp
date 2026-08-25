import type { VRMExpressionPresetName } from '@pixiv/three-vrm';

export type CompanionMood =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'celebrate'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised';

export type CompanionAction =
  | 'idle'
  | 'wave'
  | 'salute'
  | 'dance'
  | 'stretch'
  | 'heart'
  | 'peace'
  | 'neko'
  | 'bow'
  | 'cheer'
  | 'blush'
  | 'laugh'
  | 'listen'
  | 'thinking';

export type FingerPreset =
  | 'relaxed'
  | 'open'
  | 'fist'
  | 'peace'
  | 'heart'
  | 'salute'
  | 'cat';

export interface VRMPose {
  // Torso & Core
  hipsPos?: [number, number, number];
  hipsRot?: [number, number, number];
  spineRot?: [number, number, number];
  chestRot?: [number, number, number];
  upperChestRot?: [number, number, number];
  neckRot?: [number, number, number];
  headRot?: [number, number, number];

  // Left Arm Chain
  leftShoulderRot?: [number, number, number];
  leftUpperArmRot?: [number, number, number];
  leftLowerArmRot?: [number, number, number];
  leftHandRot?: [number, number, number];
  leftFingers?: FingerPreset;

  // Right Arm Chain
  rightShoulderRot?: [number, number, number];
  rightUpperArmRot?: [number, number, number];
  rightLowerArmRot?: [number, number, number];
  rightHandRot?: [number, number, number];
  rightFingers?: FingerPreset;

  // Lower Limbs (Legs, Knees, Feet)
  leftUpperLegRot?: [number, number, number];
  rightUpperLegRot?: [number, number, number];
  leftLowerLegRot?: [number, number, number];
  rightLowerLegRot?: [number, number, number];
  leftFootRot?: [number, number, number];
  rightFootRot?: [number, number, number];

  // Expression Overrides
  expressions?: Partial<Record<VRMExpressionPresetName, number>>;
}

export interface VRMViewerHandle {
  setMood: (mood: CompanionMood) => void;
  playAction: (action: CompanionAction) => void;
  startLipSync: () => void;
  stopLipSync: () => void;
}
