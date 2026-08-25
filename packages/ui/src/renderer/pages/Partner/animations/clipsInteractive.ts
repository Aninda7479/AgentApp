import { MathUtils } from 'three';
import type { VRMPose } from './types';

// ── 94. Head Pat Reaction ─────────────────────────────────────────────────────
export function getReactHeadpatPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const lean = Math.sin(actTime * 3.0) * 0.03;
  return {
    ...baseIdle,
    headRot: [-0.1, 0.04, 0.14 + lean],
    spineRot: [0.03, 0, 0],
    leftShoulderRot:  [0, 0, -0.04],
    rightShoulderRot: [0, 0, 0.04],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.22, 0],
    expressions: { happy: 1.0, relaxed: 0.9 },
  };
}

// ── 95. Cheek Poke Reaction ───────────────────────────────────────────────────
export function getReactPokePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = Math.sin(Math.min(actTime / 2.5, 1) * Math.PI);
  return {
    ...baseIdle,
    headRot: [0.04 * p, -0.15 * p, -0.1 * p],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.65 * p, -0.12, 0.45 * p],
    rightLowerArmRot: [0, -2.1 * p, -0.22 * p],
    rightHandRot:     [0.2 * p, 0, 0],
    rightFingers:     'relaxed',
    expressions: { surprised: 0.8, happy: 0.3 },
  };
}

// ── 96. Tickle Reaction ───────────────────────────────────────────────────────
export function getReactTicklePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const squirm = Math.sin(t * 16.0) * 0.05;
  return {
    ...baseIdle,
    hipsRot: [0, squirm * 1.5, squirm],
    spineRot: [0.06, -squirm, 0],
    headRot: [-0.06, squirm, 0.12],
    leftUpperArmRot:  [0.45, 0.15, -0.92],
    leftLowerArmRot:  [0, 1.65, 0.22],
    leftFingers:      'fist',
    rightUpperArmRot: [0.45, -0.15, 0.92],
    rightLowerArmRot: [0, -1.65, -0.22],
    rightFingers:     'fist',
    expressions: { happy: 1.0, surprised: 0.4 },
  };
}

// ── 97. Screen Tap Surprise ───────────────────────────────────────────────────
export function getReactTapSurprisePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = Math.sin(Math.min(actTime / 2.0, 1) * Math.PI);
  return {
    ...baseIdle,
    headRot: [-0.1 * p, 0, 0],
    spineRot: [-0.05 * p, 0, 0],
    leftShoulderRot:  [0, 0, 0.06 * p],
    rightShoulderRot: [0, 0, -0.06 * p],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.22, 0],
    expressions: { surprised: 1.0 },
  };
}

// ── 98. Stroking Hair Reaction ────────────────────────────────────────────────
export function getReactStrokeHairPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const melt = Math.sin(actTime * 2.5) * 0.03;
  return {
    ...baseIdle,
    headRot: [-0.05, 0.06, 0.16 + melt],
    spineRot: [0.02, 0, 0],
    leftShoulderRot:  [0, 0, -0.04],
    rightShoulderRot: [0, 0, 0.04],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.22, 0],
    expressions: { relaxed: 1.0, happy: 0.7 },
  };
}

// ── 99. Arm Touch Reaction ────────────────────────────────────────────────────
export function getReactArmTouchPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [0.08, -0.2, 0],
    leftUpperArmRot:  [0.15, 0, -1.18],
    leftLowerArmRot:  [0, 0.45, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.22, 0],
    expressions: { surprised: 0.6, happy: 0.4 },
  };
}

// ── 100. Nose Boop Reaction ───────────────────────────────────────────────────
export function getReactBoopPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = Math.sin(Math.min(actTime / 2.5, 1) * Math.PI);
  return {
    ...baseIdle,
    headRot: [0.06 * p, 0, 0.06],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.65 * p, -0.12, 0.45 * p],
    rightLowerArmRot: [0, -2.1 * p, -0.22 * p],
    rightFingers:     'relaxed',
    expressions: { surprised: 0.7, happy: 0.6 },
  };
}

// ── 101. Ear Pull Reaction ────────────────────────────────────────────────────
export function getReactEarPullPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [0.04, 0.18, -0.15],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.65, -0.15, 0.45],
    rightLowerArmRot: [0, -2.15, -0.25],
    rightHandRot:     [0.25, 0, 0],
    rightFingers:     'cup',
    expressions: { sad: 0.7, surprised: 0.4 },
  };
}

// ── 102. Hug Squeeze Reaction ─────────────────────────────────────────────────
export function getReactHugPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const squeeze = Math.sin(actTime * 3.0) * 0.04;
  return {
    ...baseIdle,
    spineRot: [0.06, 0, 0],
    headRot: [-0.04, 0, 0.1],
    leftUpperArmRot:  [0.55, 0.15, -1.02 + squeeze],
    leftLowerArmRot:  [0, 1.78, 0.22],
    leftHandRot:      [0.15, 0, -0.15],
    leftFingers:      'clasped',
    rightUpperArmRot: [0.58, -0.15, 1.02 - squeeze],
    rightLowerArmRot: [0, -1.78, -0.22],
    rightHandRot:     [0.15, 0, 0.15],
    rightFingers:     'clasped',
    expressions: { happy: 1.0, relaxed: 0.5 },
  };
}

// ── 103. Device Shake / Dizziness ─────────────────────────────────────────────
export function getReactDizzyPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const dizzyWobble = Math.sin(t * 7.0) * 0.1;
  const dizzyRoll = Math.cos(t * 7.0) * 0.1;
  return {
    ...baseIdle,
    hipsRot: [dizzyRoll * 0.4, 0, dizzyWobble * 0.4],
    spineRot: [dizzyRoll * 0.6, 0, dizzyWobble * 0.6],
    headRot: [dizzyRoll, dizzyWobble, dizzyRoll * 0.4],
    leftUpperArmRot:  [0.15, 0, -1.15],
    leftLowerArmRot:  [0, 0.45, 0],
    leftFingers:      'open',
    rightUpperArmRot: [0.15, 0, 1.15],
    rightLowerArmRot: [0, -0.45, 0],
    rightFingers:     'open',
    expressions: { surprised: 0.8, sad: 0.3 },
  };
}

// ── 104. Screen Swipe Reaction ────────────────────────────────────────────────
export function getReactSwipePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const swipeTrack = Math.sin(actTime * 3.0) * 0.25;
  return {
    ...baseIdle,
    headRot: [-0.04, swipeTrack, 0.04],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.22, 0],
    expressions: { happy: 0.6, neutral: 0.4 },
  };
}
