import { MathUtils } from 'three';
import type { VRMPose } from './types';

// ── 94. Head Pat Reaction ─────────────────────────────────────────────────────
export function getReactHeadpatPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const lean = Math.sin(actTime * 3.0) * 0.025;
  return {
    ...baseIdle,
    headRot: [-0.08, 0.03, 0.12 + lean],
    spineRot: [0.02, 0, 0],
    leftShoulderRot:  [0, 0, -0.04],
    rightShoulderRot: [0, 0, 0.04],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    expressions: { happy: 1.0, relaxed: 0.9 },
  };
}

// ── 95. Cheek Poke Reaction ───────────────────────────────────────────────────
export function getReactPokePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = Math.sin(Math.min(actTime / 2.5, 1) * Math.PI);
  return {
    ...baseIdle,
    headRot: [0.03 * p, -0.12 * p, -0.08 * p],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.62 * p, -0.10, 0.42 * p],
    rightLowerArmRot: [0, 2.05 * p, 0.18 * p],
    rightHandRot:     [0.18 * p, 0, 0],
    rightFingers:     'relaxed',
    expressions: { surprised: 0.8, happy: 0.3 },
  };
}

// ── 96. Tickle Reaction ───────────────────────────────────────────────────────
export function getReactTicklePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const squirm = Math.sin(t * 16.0) * 0.04;
  return {
    ...baseIdle,
    hipsRot: [0, squirm * 1.2, squirm],
    spineRot: [0.05, -squirm, 0],
    headRot: [-0.05, squirm, 0.10],
    leftUpperArmRot:  [0.38, 0.12, -0.75],
    leftLowerArmRot:  [0, -1.65, -0.15],
    leftFingers:      'fist',
    rightUpperArmRot: [0.38, -0.12, 0.75],
    rightLowerArmRot: [0, 1.65, 0.15],
    rightFingers:     'fist',
    expressions: { happy: 1.0, surprised: 0.4 },
  };
}

// ── 97. Screen Tap Surprise ───────────────────────────────────────────────────
export function getReactTapSurprisePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = Math.sin(Math.min(actTime / 2.0, 1) * Math.PI);
  return {
    ...baseIdle,
    headRot: [-0.08 * p, 0, 0],
    spineRot: [-0.04 * p, 0, 0],
    leftShoulderRot:  [0, 0, 0.05 * p],
    rightShoulderRot: [0, 0, -0.05 * p],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    expressions: { surprised: 1.0 },
  };
}

// ── 98. Stroking Hair Reaction ────────────────────────────────────────────────
export function getReactStrokeHairPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const melt = Math.sin(actTime * 2.5) * 0.025;
  return {
    ...baseIdle,
    headRot: [-0.04, 0.05, 0.14 + melt],
    spineRot: [0.02, 0, 0],
    leftShoulderRot:  [0, 0, -0.04],
    rightShoulderRot: [0, 0, 0.04],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    expressions: { relaxed: 1.0, happy: 0.7 },
  };
}

// ── 99. Arm Touch Reaction ────────────────────────────────────────────────────
export function getReactArmTouchPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [0.06, -0.15, 0],
    leftUpperArmRot:  [0.12, 0, -1.18],
    leftLowerArmRot:  [0, -0.45, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    expressions: { surprised: 0.6, happy: 0.4 },
  };
}

// ── 100. Nose Boop Reaction ───────────────────────────────────────────────────
export function getReactBoopPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = Math.sin(Math.min(actTime / 2.5, 1) * Math.PI);
  return {
    ...baseIdle,
    headRot: [0.05 * p, 0, 0.05],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.62 * p, -0.10, 0.42 * p],
    rightLowerArmRot: [0, 2.05 * p, 0.18 * p],
    rightFingers:     'relaxed',
    expressions: { surprised: 0.7, happy: 0.6 },
  };
}

// ── 101. Ear Pull Reaction ────────────────────────────────────────────────────
export function getReactEarPullPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [0.03, 0.15, -0.12],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.62, -0.15, 0.42],
    rightLowerArmRot: [0, 2.10, 0.20],
    rightHandRot:     [0.20, 0, 0],
    rightFingers:     'cup',
    expressions: { sad: 0.7, surprised: 0.4 },
  };
}

// ── 102. Hug Squeeze Reaction ─────────────────────────────────────────────────
export function getReactHugPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const squeeze = Math.sin(actTime * 3.0) * 0.03;
  return {
    ...baseIdle,
    spineRot: [0.05, 0, 0],
    headRot: [-0.03, 0, 0.08],
    leftUpperArmRot:  [0.48, 0.12, -0.85 + squeeze],
    leftLowerArmRot:  [0, -1.75, -0.18],
    leftHandRot:      [0.12, 0, -0.12],
    leftFingers:      'clasped',
    rightUpperArmRot: [0.52, -0.12, 0.85 - squeeze],
    rightLowerArmRot: [0, 1.75, 0.18],
    rightHandRot:     [0.12, 0, 0.12],
    rightFingers:     'clasped',
    expressions: { happy: 1.0, relaxed: 0.5 },
  };
}

// ── 103. Device Shake / Dizziness ─────────────────────────────────────────────
export function getReactDizzyPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const dizzyWobble = Math.sin(t * 7.0) * 0.08;
  const dizzyRoll = Math.cos(t * 7.0) * 0.08;
  return {
    ...baseIdle,
    hipsRot: [dizzyRoll * 0.3, 0, dizzyWobble * 0.3],
    spineRot: [dizzyRoll * 0.5, 0, dizzyWobble * 0.5],
    headRot: [dizzyRoll * 0.8, dizzyWobble * 0.8, dizzyRoll * 0.3],
    leftUpperArmRot:  [0.12, 0, -1.15],
    leftLowerArmRot:  [0, -0.45, 0],
    leftFingers:      'open',
    rightUpperArmRot: [0.12, 0, 1.15],
    rightLowerArmRot: [0, 0.45, 0],
    rightFingers:     'open',
    expressions: { surprised: 0.8, sad: 0.3 },
  };
}

// ── 104. Screen Swipe Reaction ────────────────────────────────────────────────
export function getReactSwipePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const swipeTrack = Math.sin(actTime * 3.0) * 0.20;
  return {
    ...baseIdle,
    headRot: [-0.03, swipeTrack, 0.03],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    expressions: { happy: 0.6, neutral: 0.4 },
  };
}
