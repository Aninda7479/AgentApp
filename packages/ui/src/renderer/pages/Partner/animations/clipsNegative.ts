import { MathUtils } from 'three';
import type { VRMPose } from './types';

// ── 81. Sad Sigh ──────────────────────────────────────────────────────────────
export function getSadSighPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = (actTime % 4.5) / 4.5;
  const droop = Math.sin(p * Math.PI);
  return {
    ...baseIdle,
    spineRot: [0.08 * droop, 0, 0],
    headRot: [0.15 * droop, 0, 0],
    leftShoulderRot:  [0, 0, -0.04 * droop],
    rightShoulderRot: [0, 0, 0.04 * droop],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    expressions: { sad: 0.85 },
  };
}

// ── 82. Crying ────────────────────────────────────────────────────────────────
export function getCryingPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const sob = Math.sin(t * 10.0) * 0.02;
  return {
    ...baseIdle,
    spineRot: [0.05 + sob, 0, 0],
    headRot: [0.12 + sob, 0, 0],
    leftUpperArmRot:  [0.62, 0.10, -0.42],
    leftLowerArmRot:  [0, -2.05 - sob, -0.18],
    leftFingers:      'fist',
    rightUpperArmRot: [0.62, -0.10, 0.42],
    rightLowerArmRot: [0, 2.05 + sob, 0.18],
    rightFingers:     'fist',
    expressions: { sad: 1.0 },
  };
}

// ── 83. Sulking ───────────────────────────────────────────────────────────────
export function getSulkingPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    hipsRot: [0, 0.30, 0],
    spineRot: [0.05, -0.20, 0],
    headRot: [0.06, -0.25, -0.06],
    leftUpperArmRot:  [0.48, 0.15, -0.85],
    leftLowerArmRot:  [0, -1.82, -0.20],
    leftFingers:      'fist',
    rightUpperArmRot: [0.52, -0.15, 0.85],
    rightLowerArmRot: [0, 1.82, 0.20],
    rightFingers:     'fist',
    expressions: { sad: 0.6, angry: 0.4 },
  };
}

// ── 84. Startled ──────────────────────────────────────────────────────────────
export function getStartledPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = Math.sin(Math.min(actTime / 2.5, 1) * Math.PI);
  return {
    ...baseIdle,
    hipsPos: [0, 0.025 * p, -0.05 * p],
    spineRot: [-0.06 * p, 0, 0],
    headRot: [-0.10 * p, 0, 0],
    leftUpperArmRot:  [0.30 * p, 0, MathUtils.lerp(-1.28, -0.85, p)],
    leftLowerArmRot:  [0, -0.85 * p, 0],
    leftFingers:      'open',
    rightUpperArmRot: [0.30 * p, 0, MathUtils.lerp(1.28, 0.85, p)],
    rightLowerArmRot: [0, 0.85 * p, 0],
    rightFingers:     'open',
    expressions: { surprised: 1.0 },
  };
}

// ── 85. Shivering ─────────────────────────────────────────────────────────────
export function getShiveringPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const shiver = Math.sin(t * 24.0) * 0.015;
  return {
    ...baseIdle,
    spineRot: [0.05 + shiver, 0, 0],
    headRot: [0.08, shiver, 0],
    leftUpperArmRot:  [0.48, 0.15, -0.85],
    leftLowerArmRot:  [0, -1.82 - shiver * 1.5, -0.20],
    leftFingers:      'fist',
    rightUpperArmRot: [0.52, -0.15, 0.85],
    rightLowerArmRot: [0, 1.82 + shiver * 1.5, 0.20],
    rightFingers:     'fist',
    expressions: { sad: 0.6, surprised: 0.3 },
  };
}

// ── 86. Angry Stomp ───────────────────────────────────────────────────────────
export function getAngryStompPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const stomp = Math.abs(Math.sin(actTime * 7.0)) * 0.05;
  return {
    ...baseIdle,
    hipsPos: [0, stomp, 0],
    spineRot: [0.03, 0, 0],
    headRot: [0.05, 0, 0],
    leftUpperArmRot:  [-0.10, -0.22, -0.95],
    leftLowerArmRot:  [0, -1.55, -0.20],
    leftFingers:      'fist',
    rightUpperArmRot: [-0.10, 0.22, 0.95],
    rightLowerArmRot: [0, 1.55, 0.20],
    rightFingers:     'fist',
    rightLowerLegRot: [stomp * 2.0, 0, 0],
    expressions: { angry: 0.95 },
  };
}

// ── 87. Facepalm ──────────────────────────────────────────────────────────────
export function getFacepalmPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.05, 0, 0],
    headRot: [0.10, 0.03, 0.04],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.65, -0.10, 0.40],
    rightLowerArmRot: [0, 2.10, 0.18],
    rightHandRot:     [0.22, 0, 0],
    rightFingers:     'open',
    expressions: { sad: 0.7, neutral: 0.3 },
  };
}

// ── 88. Anxious Fidgeting ─────────────────────────────────────────────────────
export function getAnxiousFidgetPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const fidget = Math.sin(actTime * 9.0) * 0.05;
  return {
    ...baseIdle,
    headRot: [0.05, 0, 0.04],
    leftUpperArmRot:  [0.38, 0.12, -0.75],
    leftLowerArmRot:  [0, -1.65 - fidget, -0.15],
    leftFingers:      'clasped',
    rightUpperArmRot: [0.38, -0.12, 0.75],
    rightLowerArmRot: [0, 1.65 + fidget, 0.15],
    rightFingers:     'clasped',
    expressions: { sad: 0.4, surprised: 0.3 },
  };
}

// ── 89. Pacing ────────────────────────────────────────────────────────────────
export function getPacingPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const pace = Math.sin(actTime * 3.5);
  return {
    ...baseIdle,
    hipsPos: [pace * 0.08, Math.abs(Math.cos(actTime * 3.5)) * 0.015, 0],
    hipsRot: [0, pace * 0.10, 0],
    spineRot: [0.02, -pace * 0.05, 0],
    headRot: [-0.02, pace * 0.12, 0],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    leftUpperLegRot:  [-pace * 0.10, 0, 0],
    rightUpperLegRot: [pace * 0.10, 0, 0],
    expressions: { neutral: 0.8 },
  };
}

// ── 90. Pleading ──────────────────────────────────────────────────────────────
export function getPleadingPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const please = Math.sin(actTime * 5.0) * 0.025;
  return {
    ...baseIdle,
    spineRot: [0.04, 0, 0],
    headRot: [-0.05, 0, 0.04],
    leftUpperArmRot:  [0.38, 0.12, -0.75],
    leftLowerArmRot:  [0, -1.65 - please, -0.15],
    leftFingers:      'clasped',
    rightUpperArmRot: [0.38, -0.12, 0.75],
    rightLowerArmRot: [0, 1.65 + please, 0.15],
    rightFingers:     'clasped',
    expressions: { sad: 0.7, happy: 0.3 },
  };
}

// ── 91. Curling Up ────────────────────────────────────────────────────────────
export function getCurlingUpPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    hipsPos: [0, -0.72, 0],
    spineRot: [0.28, 0, 0],
    headRot: [0.18, 0, 0],
    leftUpperArmRot:  [0.38, 0, -1.05],
    leftLowerArmRot:  [0, -1.65, -0.12],
    leftFingers:      'fist',
    rightUpperArmRot: [0.38, 0, 1.05],
    rightLowerArmRot: [0, 1.65, 0.12],
    rightFingers:     'fist',
    leftUpperLegRot:  [-1.45, 0.08, 0],
    rightUpperLegRot: [-1.45, -0.08, 0],
    leftLowerLegRot:  [2.0, 0, 0],
    rightLowerLegRot: [2.0, 0, 0],
    expressions: { sad: 0.9 },
  };
}

// ── 92. Trembling Lip ─────────────────────────────────────────────────────────
export function getTremblingLipPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const tremble = Math.sin(t * 22.0) * 0.01;
  return {
    ...baseIdle,
    headRot: [-0.05 + tremble, 0, 0.05],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    rightFingers:     'relaxed',
    expressions: { sad: 0.95, lookUp: 0.4 },
  };
}

// ── 93. Embarrassed Hide ──────────────────────────────────────────────────────
export function getEmbarrassedHidePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.05, 0, 0],
    headRot: [0.10, 0, 0],
    leftUpperArmRot:  [0.62, 0.10, -0.42],
    leftLowerArmRot:  [0, -2.05, -0.18],
    leftFingers:      'open',
    rightUpperArmRot: [0.62, -0.10, 0.42],
    rightLowerArmRot: [0, 2.05, 0.18],
    rightFingers:     'open',
    expressions: { relaxed: 0.8, sad: 0.4 },
  };
}
