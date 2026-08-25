import { MathUtils } from 'three';
import type { VRMPose } from './types';

// ── 81. Sad Sigh ──────────────────────────────────────────────────────────────
export function getSadSighPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = (actTime % 4.5) / 4.5;
  const droop = Math.sin(p * Math.PI);
  return {
    ...baseIdle,
    spineRot: [0.1 * droop, 0, 0],
    headRot: [0.2 * droop, 0, 0],
    leftShoulderRot:  [0, 0, -0.05 * droop],
    rightShoulderRot: [0, 0, 0.05 * droop],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.22, 0],
    expressions: { sad: 0.85 },
  };
}

// ── 82. Crying ────────────────────────────────────────────────────────────────
export function getCryingPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const sob = Math.sin(t * 10.0) * 0.025;
  return {
    ...baseIdle,
    spineRot: [0.06 + sob, 0, 0],
    headRot: [0.15 + sob, 0, 0],
    leftUpperArmRot:  [0.65, 0.12, -0.45],
    leftLowerArmRot:  [0, 2.1 + sob, 0.22],
    leftFingers:      'fist',
    rightUpperArmRot: [0.65, -0.12, 0.45],
    rightLowerArmRot: [0, -2.1 - sob, -0.22],
    rightFingers:     'fist',
    expressions: { sad: 1.0 },
  };
}

// ── 83. Sulking ───────────────────────────────────────────────────────────────
export function getSulkingPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    hipsRot: [0, 0.35, 0],
    spineRot: [0.06, -0.25, 0],
    headRot: [0.08, -0.3, -0.08],
    leftUpperArmRot:  [0.55, 0.15, -1.02],
    leftLowerArmRot:  [0, 1.78, 0.22],
    leftFingers:      'fist',
    rightUpperArmRot: [0.58, -0.15, 1.02],
    rightLowerArmRot: [0, -1.78, -0.22],
    rightFingers:     'fist',
    expressions: { sad: 0.6, angry: 0.4 },
  };
}

// ── 84. Startled ──────────────────────────────────────────────────────────────
export function getStartledPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = Math.sin(Math.min(actTime / 2.5, 1) * Math.PI);
  return {
    ...baseIdle,
    hipsPos: [0, 0.03 * p, -0.06 * p],
    spineRot: [-0.08 * p, 0, 0],
    headRot: [-0.12 * p, 0, 0],
    leftUpperArmRot:  [0.35 * p, 0, MathUtils.lerp(-1.28, -0.85, p)],
    leftLowerArmRot:  [0, 0.85 * p, 0],
    leftFingers:      'open',
    rightUpperArmRot: [0.35 * p, 0, MathUtils.lerp(1.28, 0.85, p)],
    rightLowerArmRot: [0, -0.85 * p, 0],
    rightFingers:     'open',
    expressions: { surprised: 1.0 },
  };
}

// ── 85. Shivering ─────────────────────────────────────────────────────────────
export function getShiveringPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const shiver = Math.sin(t * 24.0) * 0.02;
  return {
    ...baseIdle,
    spineRot: [0.06 + shiver, 0, 0],
    headRot: [0.1, shiver, 0],
    leftUpperArmRot:  [0.55, 0.15, -1.02],
    leftLowerArmRot:  [0, 1.78 + shiver * 2.0, 0.22],
    leftFingers:      'fist',
    rightUpperArmRot: [0.58, -0.15, 1.02],
    rightLowerArmRot: [0, -1.78 - shiver * 2.0, -0.22],
    rightFingers:     'fist',
    expressions: { sad: 0.6, surprised: 0.3 },
  };
}

// ── 86. Angry Stomp ───────────────────────────────────────────────────────────
export function getAngryStompPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const stomp = Math.abs(Math.sin(actTime * 7.0)) * 0.06;
  return {
    ...baseIdle,
    hipsPos: [0, stomp, 0],
    spineRot: [0.04, 0, 0],
    headRot: [0.06, 0, 0],
    leftUpperArmRot:  [-0.12, -0.25, -1.12],
    leftLowerArmRot:  [0, 1.35, 0.2],
    leftFingers:      'fist',
    rightUpperArmRot: [-0.12, 0.25, 1.12],
    rightLowerArmRot: [0, -1.35, -0.2],
    rightFingers:     'fist',
    rightLowerLegRot: [stomp * 2.5, 0, 0],
    expressions: { angry: 0.95 },
  };
}

// ── 87. Facepalm ──────────────────────────────────────────────────────────────
export function getFacepalmPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.06, 0, 0],
    headRot: [0.12, 0.04, 0.05],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.68, -0.12, 0.42],
    rightLowerArmRot: [0, -2.15, -0.22],
    rightHandRot:     [0.25, 0, 0],
    rightFingers:     'open',
    expressions: { sad: 0.7, neutral: 0.3 },
  };
}

// ── 88. Anxious Fidgeting ─────────────────────────────────────────────────────
export function getAnxiousFidgetPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const fidget = Math.sin(actTime * 9.0) * 0.06;
  return {
    ...baseIdle,
    headRot: [0.06, 0, 0.05],
    leftUpperArmRot:  [0.45, 0.15, -0.92],
    leftLowerArmRot:  [0, 1.65 + fidget, 0.22],
    leftFingers:      'clasped',
    rightUpperArmRot: [0.45, -0.15, 0.92],
    rightLowerArmRot: [0, -1.65 - fidget, -0.22],
    rightFingers:     'clasped',
    expressions: { sad: 0.4, surprised: 0.3 },
  };
}

// ── 89. Pacing ────────────────────────────────────────────────────────────────
export function getPacingPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const pace = Math.sin(actTime * 3.5);
  return {
    ...baseIdle,
    hipsPos: [pace * 0.1, Math.abs(Math.cos(actTime * 3.5)) * 0.02, 0],
    hipsRot: [0, pace * 0.12, 0],
    spineRot: [0.03, -pace * 0.06, 0],
    headRot: [-0.02, pace * 0.15, 0],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.22, 0],
    leftUpperLegRot:  [-pace * 0.12, 0, 0],
    rightUpperLegRot: [pace * 0.12, 0, 0],
    expressions: { neutral: 0.8 },
  };
}

// ── 90. Pleading ──────────────────────────────────────────────────────────────
export function getPleadingPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const please = Math.sin(actTime * 5.0) * 0.03;
  return {
    ...baseIdle,
    spineRot: [0.05, 0, 0],
    headRot: [-0.06, 0, 0.05],
    leftUpperArmRot:  [0.45, 0.15, -0.92],
    leftLowerArmRot:  [0, 1.65 + please, 0.22],
    leftFingers:      'clasped',
    rightUpperArmRot: [0.45, -0.15, 0.92],
    rightLowerArmRot: [0, -1.65 - please, -0.22],
    rightFingers:     'clasped',
    expressions: { sad: 0.7, happy: 0.3 },
  };
}

// ── 91. Curling Up ────────────────────────────────────────────────────────────
export function getCurlingUpPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    hipsPos: [0, -0.78, 0],
    spineRot: [0.32, 0, 0],
    headRot: [0.22, 0, 0],
    leftUpperArmRot:  [0.45, 0, -1.05],
    leftLowerArmRot:  [0, 1.65, 0.15],
    leftFingers:      'fist',
    rightUpperArmRot: [0.45, 0, 1.05],
    rightLowerArmRot: [0, -1.65, -0.15],
    rightFingers:     'fist',
    leftUpperLegRot:  [-1.6, 0.1, 0],
    rightUpperLegRot: [-1.6, -0.1, 0],
    leftLowerLegRot:  [2.2, 0, 0],
    rightLowerLegRot: [2.2, 0, 0],
    expressions: { sad: 0.9 },
  };
}

// ── 92. Trembling Lip ─────────────────────────────────────────────────────────
export function getTremblingLipPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const tremble = Math.sin(t * 22.0) * 0.012;
  return {
    ...baseIdle,
    headRot: [-0.06 + tremble, 0, 0.06],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.22, 0],
    rightFingers:     'relaxed',
    expressions: { sad: 0.95, lookUp: 0.4 },
  };
}

// ── 93. Embarrassed Hide ──────────────────────────────────────────────────────
export function getEmbarrassedHidePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.06, 0, 0],
    headRot: [0.12, 0, 0],
    leftUpperArmRot:  [0.65, 0.12, -0.45],
    leftLowerArmRot:  [0, 2.1, 0.22],
    leftFingers:      'open',
    rightUpperArmRot: [0.65, -0.12, 0.45],
    rightLowerArmRot: [0, -2.1, -0.22],
    rightFingers:     'open',
    expressions: { relaxed: 0.8, sad: 0.4 },
  };
}
