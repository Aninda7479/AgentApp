import { MathUtils } from 'three';
import type { VRMPose } from './types';

// ── 54. Nodding Slowly ────────────────────────────────────────────────────────
export function getTalkNodPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const nod = Math.sin(actTime * 3.5) * 0.12;
  return {
    ...baseIdle,
    headRot: [nod + 0.04, 0, 0],
    spineRot: [0.02, 0, 0],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    rightFingers:     'relaxed',
    expressions: { happy: 0.6, neutral: 0.4 },
  };
}

// ── 55. Shaking Head ──────────────────────────────────────────────────────────
export function getTalkShakeHeadPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const shake = Math.sin(actTime * 5.0) * 0.18;
  return {
    ...baseIdle,
    headRot: [0.02, shake, -shake * 0.12],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    rightFingers:     'relaxed',
    expressions: { neutral: 0.8 },
  };
}

// ── 56. Shrugging ─────────────────────────────────────────────────────────────
export function getTalkShrugPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = Math.sin(Math.min(actTime / 3.2, 1) * Math.PI);
  return {
    ...baseIdle,
    headRot: [-0.03 * p, 0, 0.10 * p],
    leftShoulderRot:  [0, 0, 0.15 * p],
    rightShoulderRot: [0, 0, -0.15 * p],
    leftUpperArmRot:  [0.30 * p, 0, MathUtils.lerp(-1.28, -0.95, p)],
    leftLowerArmRot:  [0, -1.15 * p, 0],
    leftHandRot:      [0.12 * p, 0, -0.12 * p],
    leftFingers:      'open',
    rightUpperArmRot: [0.30 * p, 0, MathUtils.lerp(1.28, 0.95, p)],
    rightLowerArmRot: [0, 1.15 * p, 0],
    rightHandRot:     [0.12 * p, 0, 0.12 * p],
    rightFingers:     'open',
    expressions: { neutral: 0.7, surprised: 0.3 },
  };
}

// ── 57. Counting on Fingers ───────────────────────────────────────────────────
export function getTalkCountFingersPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const step = Math.floor((actTime * 1.5) % 3);
  return {
    ...baseIdle,
    headRot: [0.08, -0.06, 0],
    leftUpperArmRot:  [0.38, 0, -0.75],
    leftLowerArmRot:  [0, -1.65, -0.12],
    leftFingers:      step === 0 ? 'pointing' : step === 1 ? 'peace' : 'open',
    rightUpperArmRot: [0.38, 0, 0.75],
    rightLowerArmRot: [0, 1.65, 0.12],
    rightHandRot:     [0.12, 0, 0.12],
    rightFingers:     'pointing',
    expressions: { neutral: 0.8 },
  };
}

// ── 58. Pointing at Screen ────────────────────────────────────────────────────
export function getTalkPointScreenPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.03, 0.03, 0.05],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.48, 0, 0.85],
    rightLowerArmRot: [0, 0.95, 0],
    rightHandRot:     [0.12, 0, 0],
    rightFingers:     'pointing',
    expressions: { happy: 0.7 },
  };
}

// ── 59. Pointing at Self ──────────────────────────────────────────────────────
export function getTalkPointSelfPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [0.05, -0.03, 0.05],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.48, -0.12, 0.55],
    rightLowerArmRot: [0, 1.85, 0.18],
    rightHandRot:     [0.20, 0, 0],
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
    spineRot: [0.03 + g1 * 0.012, g2 * 0.012, 0],
    headRot: [
      (baseIdle.headRot?.[0] || 0) + Math.sin(t * 4.8) * 0.025,
      (baseIdle.headRot?.[1] || 0) + Math.cos(t * 2.2) * 0.02,
      (baseIdle.headRot?.[2] || 0) + g1 * 0.012,
    ],
    leftUpperArmRot:  [0.15, 0, -1.22 + g2 * 0.04],
    leftLowerArmRot:  [0, -0.45 - g1 * 0.08, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.25 + g2 * 0.06, 0, 1.05 - g1 * 0.06],
    rightLowerArmRot: [0, 0.75 + g2 * 0.12, 0],
    rightHandRot:     [0.12 + g1 * 0.06, 0, 0],
    rightFingers:     'open',
  };
}

// ── 61. Tilting Head ──────────────────────────────────────────────────────────
export function getTalkTiltHeadPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.03, 0.05, 0.20],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    expressions: { surprised: 0.4, happy: 0.35 },
  };
}

// ── 62. Cupping Ear ───────────────────────────────────────────────────────────
export function getTalkCupEarPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.05, -0.03, 0],
    headRot: [-0.04, -0.10, 0.14],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.62, -0.15, 0.42],
    rightLowerArmRot: [0, 2.10, 0.20],
    rightHandRot:     [0.20, 0, 0.08],
    rightFingers:     'cup',
    expressions: { surprised: 0.4, neutral: 0.6 },
  };
}

// ── 63. Hand to Chest ─────────────────────────────────────────────────────────
export function getTalkHandChestPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.03, 0, 0],
    headRot: [-0.03, 0.03, 0.05],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.48, -0.10, 0.55],
    rightLowerArmRot: [0, 1.75, 0.15],
    rightHandRot:     [0.12, 0, 0],
    rightFingers:     'open',
    expressions: { happy: 0.7, relaxed: 0.4 },
  };
}

// ── 64. Wagging Finger ────────────────────────────────────────────────────────
export function getTalkWagFingerPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const wag = Math.sin(actTime * 9.0) * 0.20;
  return {
    ...baseIdle,
    headRot: [-0.02, 0.04, 0.05],
    leftUpperArmRot:  [-0.10, -0.22, -0.95],
    leftLowerArmRot:  [0, -1.55, -0.20],
    leftFingers:      'fist',
    rightUpperArmRot: [0.38, 0, 0.85],
    rightLowerArmRot: [0, 1.45, 0.12],
    rightHandRot:     [0.12, 0, wag],
    rightFingers:     'pointing',
    expressions: { neutral: 0.8, happy: 0.2 },
  };
}

// ── 65. Raising One Eyebrow ───────────────────────────────────────────────────
export function getTalkEyebrowPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.03, 0.04, 0.08],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    expressions: { neutral: 0.6, surprised: 0.5 },
  };
}

// ── 66. Deep Breath In & Out ──────────────────────────────────────────────────
export function getTalkDeepBreathPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = (actTime % 4.0) / 4.0;
  const breath = Math.sin(p * Math.PI);
  return {
    ...baseIdle,
    spineRot: [-0.04 * breath, 0, 0],
    chestRot: [0.06 * breath, 0, 0],
    headRot: [-0.06 * breath, 0, 0],
    leftShoulderRot:  [0, 0, 0.03 * breath],
    rightShoulderRot: [0, 0, -0.03 * breath],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    expressions: { relaxed: 0.85 },
  };
}

// ── 67. Looking Around ────────────────────────────────────────────────────────
export function getTalkLookAroundPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const look = Math.sin(actTime * 1.5) * 0.25;
  return {
    ...baseIdle,
    spineRot: [0, look * 0.12, 0],
    headRot: [-0.02, look, 0.03],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    expressions: { neutral: 0.8 },
  };
}

// ── 68. Whisper Pose ──────────────────────────────────────────────────────────
export function getTalkWhisperPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.06, -0.06, 0],
    headRot: [-0.04, -0.12, 0.08],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.62, -0.10, 0.42],
    rightLowerArmRot: [0, 2.05, 0.18],
    rightHandRot:     [0.20, 0, 0.08],
    rightFingers:     'cup',
    expressions: { happy: 0.6, surprised: 0.3 },
  };
}

// ── 69. Polite Interruption ───────────────────────────────────────────────────
export function getTalkInterruptionPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.03, 0.03, 0.04],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.38, 0, 0.85],
    rightLowerArmRot: [0, 1.45, 0.12],
    rightHandRot:     [0.12, 0, 0],
    rightFingers:     'pointing',
    expressions: { neutral: 0.7, surprised: 0.3 },
  };
}
