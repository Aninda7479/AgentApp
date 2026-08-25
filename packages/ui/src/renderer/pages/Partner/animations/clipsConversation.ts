import { MathUtils } from 'three';
import type { VRMPose } from './types';

// ── 54. Nodding Slowly ────────────────────────────────────────────────────────
export function getTalkNodPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const nod = Math.sin(actTime * 3.5) * 0.14;
  return {
    ...baseIdle,
    headRot: [nod + 0.05, 0, 0],
    spineRot: [0.03, 0, 0],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.22, 0],
    rightFingers:     'relaxed',
    expressions: { happy: 0.6, neutral: 0.4 },
  };
}

// ── 55. Shaking Head ──────────────────────────────────────────────────────────
export function getTalkShakeHeadPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const shake = Math.sin(actTime * 5.0) * 0.2;
  return {
    ...baseIdle,
    headRot: [0.02, shake, -shake * 0.15],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.22, 0],
    rightFingers:     'relaxed',
    expressions: { neutral: 0.8 },
  };
}

// ── 56. Shrugging ─────────────────────────────────────────────────────────────
export function getTalkShrugPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = Math.sin(Math.min(actTime / 3.2, 1) * Math.PI);
  return {
    ...baseIdle,
    headRot: [-0.04 * p, 0, 0.12 * p],
    leftShoulderRot:  [0, 0, 0.15 * p],
    rightShoulderRot: [0, 0, -0.15 * p],
    leftUpperArmRot:  [0.35 * p, 0, MathUtils.lerp(-1.28, -0.95, p)],
    leftLowerArmRot:  [0, 1.15 * p, 0],
    leftHandRot:      [0.15 * p, 0, -0.15 * p],
    leftFingers:      'open',
    rightUpperArmRot: [0.35 * p, 0, MathUtils.lerp(1.28, 0.95, p)],
    rightLowerArmRot: [0, -1.15 * p, 0],
    rightHandRot:     [0.15 * p, 0, 0.15 * p],
    rightFingers:     'open',
    expressions: { neutral: 0.7, surprised: 0.3 },
  };
}

// ── 57. Counting on Fingers ───────────────────────────────────────────────────
export function getTalkCountFingersPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const step = Math.floor((actTime * 1.5) % 3);
  return {
    ...baseIdle,
    headRot: [0.1, -0.08, 0],
    leftUpperArmRot:  [0.45, 0, -0.85],
    leftLowerArmRot:  [0, 1.65, 0.15],
    leftFingers:      step === 0 ? 'pointing' : step === 1 ? 'peace' : 'open',
    rightUpperArmRot: [0.45, 0, 0.85],
    rightLowerArmRot: [0, -1.65, -0.15],
    rightHandRot:     [0.15, 0, 0.15],
    rightFingers:     'pointing',
    expressions: { neutral: 0.8 },
  };
}

// ── 58. Pointing at Screen ────────────────────────────────────────────────────
export function getTalkPointScreenPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.04, 0.04, 0.06],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.55, 0, 0.85],
    rightLowerArmRot: [0, -0.95, 0],
    rightHandRot:     [0.15, 0, 0],
    rightFingers:     'pointing',
    expressions: { happy: 0.7 },
  };
}

// ── 59. Pointing at Self ──────────────────────────────────────────────────────
export function getTalkPointSelfPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [0.06, -0.04, 0.06],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.55, -0.15, 0.55],
    rightLowerArmRot: [0, -1.85, -0.2],
    rightHandRot:     [0.25, 0, 0],
    rightFingers:     'pointing',
    expressions: { surprised: 0.5, happy: 0.4 },
  };
}

// ── 60. Talking with Hands (General Speech) ───────────────────────────────────
export function getTalkHandsPose(t: number, baseIdle: VRMPose): VRMPose {
  return getTalkingPose(t, baseIdle);
}

export function getTalkingPose(t: number, baseIdle: VRMPose): VRMPose {
  const g1 = Math.sin(t * 3.6);
  const g2 = Math.cos(t * 2.8);

  return {
    ...baseIdle,
    spineRot: [0.03 + g1 * 0.015, g2 * 0.015, 0],
    headRot: [
      (baseIdle.headRot?.[0] || 0) + Math.sin(t * 4.8) * 0.03,
      (baseIdle.headRot?.[1] || 0) + Math.cos(t * 2.2) * 0.025,
      (baseIdle.headRot?.[2] || 0) + g1 * 0.015,
    ],
    leftUpperArmRot:  [0.15, 0, -1.22 + g2 * 0.05],
    leftLowerArmRot:  [0, 0.45 + g1 * 0.1, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.28 + g2 * 0.08, 0, 1.05 - g1 * 0.08],
    rightLowerArmRot: [0, -0.75 - g2 * 0.15, 0],
    rightHandRot:     [0.15 + g1 * 0.08, 0, 0],
    rightFingers:     'open',
  };
}

// ── 61. Tilting Head ──────────────────────────────────────────────────────────
export function getTalkTiltHeadPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.04, 0.06, 0.22],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.22, 0],
    expressions: { surprised: 0.4, happy: 0.35 },
  };
}

// ── 62. Cupping Ear ───────────────────────────────────────────────────────────
export function getTalkCupEarPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.06, -0.04, 0],
    headRot: [-0.05, -0.12, 0.16],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.65, -0.15, 0.45],
    rightLowerArmRot: [0, -2.15, -0.25],
    rightHandRot:     [0.25, 0, 0.1],
    rightFingers:     'cup',
    expressions: { surprised: 0.4, neutral: 0.6 },
  };
}

// ── 63. Hand to Chest ─────────────────────────────────────────────────────────
export function getTalkHandChestPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.04, 0, 0],
    headRot: [-0.04, 0.04, 0.06],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.55, -0.12, 0.55],
    rightLowerArmRot: [0, -1.75, -0.18],
    rightHandRot:     [0.15, 0, 0],
    rightFingers:     'open',
    expressions: { happy: 0.7, relaxed: 0.4 },
  };
}

// ── 64. Wagging Finger ────────────────────────────────────────────────────────
export function getTalkWagFingerPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const wag = Math.sin(actTime * 9.0) * 0.22;
  return {
    ...baseIdle,
    headRot: [-0.02, 0.05, 0.06],
    leftUpperArmRot:  [-0.12, -0.25, -1.12],
    leftLowerArmRot:  [0, 1.35, 0.2],
    leftFingers:      'fist',
    rightUpperArmRot: [0.45, 0, 0.85],
    rightLowerArmRot: [0, -1.45, -0.15],
    rightHandRot:     [0.15, 0, wag],
    rightFingers:     'pointing',
    expressions: { neutral: 0.8, happy: 0.2 },
  };
}

// ── 65. Raising One Eyebrow ───────────────────────────────────────────────────
export function getTalkEyebrowPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.04, 0.05, 0.1],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.22, 0],
    expressions: { neutral: 0.6, surprised: 0.5 },
  };
}

// ── 66. Deep Breath In & Out ──────────────────────────────────────────────────
export function getTalkDeepBreathPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = (actTime % 4.0) / 4.0;
  const breath = Math.sin(p * Math.PI);
  return {
    ...baseIdle,
    spineRot: [-0.05 * breath, 0, 0],
    chestRot: [0.08 * breath, 0, 0],
    headRot: [-0.08 * breath, 0, 0],
    leftShoulderRot:  [0, 0, 0.04 * breath],
    rightShoulderRot: [0, 0, -0.04 * breath],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.22, 0],
    expressions: { relaxed: 0.85 },
  };
}

// ── 67. Looking Around ────────────────────────────────────────────────────────
export function getTalkLookAroundPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const look = Math.sin(actTime * 1.5) * 0.3;
  return {
    ...baseIdle,
    spineRot: [0, look * 0.15, 0],
    headRot: [-0.02, look, 0.04],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.22, 0],
    expressions: { neutral: 0.8 },
  };
}

// ── 68. Whisper Pose ──────────────────────────────────────────────────────────
export function getTalkWhisperPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.08, -0.08, 0],
    headRot: [-0.05, -0.15, 0.1],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.65, -0.12, 0.45],
    rightLowerArmRot: [0, -2.1, -0.2],
    rightHandRot:     [0.25, 0, 0.1],
    rightFingers:     'cup',
    expressions: { happy: 0.6, surprised: 0.3 },
  };
}

// ── 69. Polite Interruption ───────────────────────────────────────────────────
export function getTalkInterruptionPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.04, 0.04, 0.05],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.45, 0, 0.85],
    rightLowerArmRot: [0, -1.45, -0.15],
    rightHandRot:     [0.15, 0, 0],
    rightFingers:     'pointing',
    expressions: { neutral: 0.7, surprised: 0.3 },
  };
}
