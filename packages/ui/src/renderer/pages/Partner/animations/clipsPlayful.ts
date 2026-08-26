import { MathUtils } from 'three';
import type { VRMPose } from './types';

// ── 70. Playful Pout ──────────────────────────────────────────────────────────
export function getPoutPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.03, -0.05, 0],
    headRot: [0.04, -0.10, -0.05],
    leftUpperArmRot:  [0.48, 0.15, -0.85],
    leftLowerArmRot:  [0, -1.82, -0.20],
    leftFingers:      'fist',
    rightUpperArmRot: [0.52, -0.15, 0.85],
    rightLowerArmRot: [0, 1.82, 0.20],
    rightFingers:     'fist',
    expressions: { sad: 0.6, angry: 0.3 },
  };
}

// ── 71. Sticking Tongue Out ───────────────────────────────────────────────────
export function getTongueOutPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.03, 0.05, 0.15],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.35, 0, 0.65],
    rightLowerArmRot: [0, 1.45, -0.25],
    rightFingers:     'peace',
    expressions: { happy: 1.0, surprised: 0.3 },
  };
}

// ── 72. Eyeroll & Smirk ───────────────────────────────────────────────────────
export function getEyerollPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.10, -0.08, 0.10],
    leftUpperArmRot:  [-0.10, -0.22, -0.95],
    leftLowerArmRot:  [0, -1.55, -0.20],
    leftFingers:      'fist',
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    rightFingers:     'relaxed',
    expressions: { lookUp: 0.8, happy: 0.4 },
  };
}

// ── 73. Fake Yawn ─────────────────────────────────────────────────────────────
export function getFakeYawnPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const tap = Math.sin(actTime * 7.0) * 0.05;
  return {
    ...baseIdle,
    headRot: [-0.08, 0, 0],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.62, -0.10, 0.42],
    rightLowerArmRot: [0, 2.05 + tap, 0.18],
    rightHandRot:     [0.20, 0, 0],
    rightFingers:     'cup',
    expressions: { relaxed: 0.8, surprised: 0.4 },
  };
}

// ── 74. Peek-a-boo ────────────────────────────────────────────────────
export function getPeekabooPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const phase = (actTime % 3.5) / 3.5;
  if (phase < 0.5) {
    // Hands covering face
    return {
      ...baseIdle,
      headRot: [0.03, 0, 0],
      leftUpperArmRot:  [0.62, 0.10, -0.42],
      leftLowerArmRot:  [0, -2.05, -0.18],
      leftHandRot:      [0.18, 0, -0.12],
      leftFingers:      'open',
      rightUpperArmRot: [0.62, -0.10, 0.42],
      rightLowerArmRot: [0, 2.05, 0.18],
      rightHandRot:     [0.18, 0, 0.12],
      rightFingers:     'open',
      expressions: { neutral: 0.8 },
    };
  } else {
    // Open hands out with big smile
    return {
      ...baseIdle,
      headRot: [-0.05, 0, 0],
      leftUpperArmRot:  [0.30, 0, -0.95],
      leftLowerArmRot:  [0, -0.95, 0],
      leftFingers:      'open',
      rightUpperArmRot: [0.30, 0, 0.95],
      rightLowerArmRot: [0, 0.95, 0],
      rightFingers:     'open',
      expressions: { happy: 1.0, surprised: 0.5 },
    };
  }
}

// ── 75. "I'm Watching You" ────────────────────────────────────────────────────
export function getWatchingYouPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const phase = (actTime % 3.8) / 3.8;
  if (phase < 0.45) {
    // 2 fingers pointing to own eyes
    return {
      ...baseIdle,
      headRot: [-0.03, 0.03, 0.05],
      leftUpperArmRot:  [0.08, -0.04, -1.28],
      leftLowerArmRot:  [0, -0.22, 0],
      rightUpperArmRot: [0.62, -0.10, 0.42],
      rightLowerArmRot: [0, 2.05, 0.18],
      rightHandRot:     [0.20, 0, 0.08],
      rightFingers:     'peace',
      expressions: { neutral: 0.9 },
    };
  } else {
    // Point 2 fingers directly at user
    return {
      ...baseIdle,
      headRot: [-0.03, 0.03, 0.04],
      leftUpperArmRot:  [0.08, -0.04, -1.28],
      leftLowerArmRot:  [0, -0.22, 0],
      rightUpperArmRot: [0.48, 0, 0.85],
      rightLowerArmRot: [0, 0.95, 0],
      rightHandRot:     [0.12, 0, 0],
      rightFingers:     'peace',
      expressions: { neutral: 0.9, happy: 0.3 },
    };
  }
}

// ── 76. Playful Punch ─────────────────────────────────────────────────────────
export function getPlayfulPunchPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = Math.sin(Math.min(actTime / 3.0, 1) * Math.PI);
  return {
    ...baseIdle,
    spineRot: [0.03 * p, -0.10 * p, 0],
    headRot: [-0.03, 0.06 * p, 0.05],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.48 * p, 0, MathUtils.lerp(1.28, 0.35, p)],
    rightLowerArmRot: [0, 0.85 * p, 0],
    rightHandRot:     [0.12 * p, 0, 0],
    rightFingers:     'fist',
    expressions: { happy: 0.8, surprised: 0.2 },
  };
}

// ── 77. Pretend Mic Drop ──────────────────────────────────────────────────────
export function getMicDropPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const phase = (actTime % 3.6) / 3.6;
  const isDrop = phase > 0.45;
  return {
    ...baseIdle,
    hipsRot: [0, 0.08, 0],
    spineRot: [0.02, -0.05, 0],
    headRot: [-0.04, 0.06, 0.10],
    leftUpperArmRot:  [-0.10, -0.22, -0.95],
    leftLowerArmRot:  [0, -1.55, -0.20],
    leftFingers:      'fist',
    rightUpperArmRot: [0.48, 0, 0.85],
    rightLowerArmRot: [0, 0.95, 0],
    rightHandRot:     [0.12, 0, 0],
    rightFingers:     isDrop ? 'open' : 'fist',
    expressions: { happy: 0.85 },
  };
}

// ── 78. Dusting Shoulders ─────────────────────────────────────────────────────
export function getDustShouldersPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const brush = Math.sin(actTime * 9.0) * 0.10;
  return {
    ...baseIdle,
    headRot: [-0.03, -0.12, 0.06],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.48, 0.12, 0.55],
    rightLowerArmRot: [0, 1.85 + brush, 0.18],
    rightHandRot:     [0.15, 0, 0],
    rightFingers:     'open',
    expressions: { happy: 0.8 },
  };
}

// ── 79. Looking at Nails ──────────────────────────────────────────────────────
export function getLookNailsPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.02, -0.04, 0],
    headRot: [0.10, 0.12, 0.06],
    leftUpperArmRot:  [-0.10, -0.22, -0.95],
    leftLowerArmRot:  [0, -1.55, -0.20],
    leftFingers:      'fist',
    rightUpperArmRot: [0.38, 0, 0.85],
    rightLowerArmRot: [0, 1.65, 0.12],
    rightHandRot:     [0.20, 0, 0],
    rightFingers:     'cat',
    expressions: { neutral: 0.8, happy: 0.2 },
  };
}

// ── 80. Cat Paws Pose (Neko 🐱) ──────────────────────────────────────────────
export function getNekoPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const pawL = Math.sin(t * 6.5) * 0.12;
  const pawR = Math.cos(t * 6.5) * 0.12;
  const headSway = Math.sin(t * 3.0) * 0.10;

  return {
    ...baseIdle,
    headRot: [0, Math.cos(t * 2.5) * 0.06, headSway],
    leftUpperArmRot:  [0.48, 0.12, -0.75],
    leftLowerArmRot:  [0, -1.85 - pawL, -0.15],
    leftHandRot:      [0.35, 0, 0],
    leftFingers:      'cat',
    rightUpperArmRot: [0.48, -0.12, 0.75],
    rightLowerArmRot: [0, 1.85 + pawR, 0.15],
    rightHandRot:     [0.35, 0, 0],
    rightFingers:     'cat',
    expressions: { happy: 0.95 },
  };
}
