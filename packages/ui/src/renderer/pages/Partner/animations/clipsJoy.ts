import { MathUtils } from 'three';
import type { VRMPose } from './types';

// ── 41. Happy Clapping ────────────────────────────────────────────────────────
export function getClapPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const clap = Math.sin(actTime * 14.0);
  const clapDist = Math.max(0, clap) * 0.12;
  return {
    ...baseIdle,
    spineRot: [0.03, 0, 0],
    headRot: [-0.04, 0, 0.05],
    leftUpperArmRot:  [0.45, 0.15, -0.92],
    leftLowerArmRot:  [0, 1.65 + clapDist, 0.22],
    leftHandRot:      [0.15, 0, -0.1],
    leftFingers:      'open',
    rightUpperArmRot: [0.45, -0.15, 0.92],
    rightLowerArmRot: [0, -1.65 - clapDist, -0.22],
    rightHandRot:     [0.15, 0, 0.1],
    rightFingers:     'open',
    expressions: { happy: 1.0 },
  };
}

// ── 42. Jumping for Joy ───────────────────────────────────────────────────────
export function getJumpJoyPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const hop = Math.abs(Math.sin(actTime * 9.0)) * 0.06;
  const bounceArm = Math.sin(actTime * 9.0) * 0.2;
  return {
    ...baseIdle,
    hipsPos: [0, hop, 0],
    spineRot: [-0.04, 0, 0],
    headRot: [-0.12, 0, 0],
    leftShoulderRot:  [0, 0, 0.15],
    rightShoulderRot: [0, 0, -0.15],
    leftUpperArmRot:  [0.25, 0, 1.85 + bounceArm],
    leftLowerArmRot:  [0, 0.45, 0],
    leftFingers:      'open',
    rightUpperArmRot: [0.25, 0, -1.85 - bounceArm],
    rightLowerArmRot: [0, -0.45, 0],
    rightFingers:     'open',
    expressions: { happy: 1.0, surprised: 0.3 },
  };
}

// ── 43. Excited Spin (360° Pirouette) ─────────────────────────────────────────
export function getSpinPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const spinProg = (actTime * 2.5) % (Math.PI * 2);
  return {
    ...baseIdle,
    hipsRot: [0, spinProg, 0],
    spineRot: [0, 0, 0],
    headRot: [-0.05, Math.sin(spinProg) * 0.15, 0],
    leftUpperArmRot:  [0.12, 0, -1.05],
    leftLowerArmRot:  [0, 0.45, 0],
    leftFingers:      'open',
    rightUpperArmRot: [0.12, 0, 1.05],
    rightLowerArmRot: [0, -0.45, 0],
    rightFingers:     'open',
    expressions: { happy: 1.0 },
  };
}

// ── 44. Fist Pump ─────────────────────────────────────────────────────────────
export function getFistPumpPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const pump = Math.sin(actTime * 8.0) * 0.18;
  return {
    ...baseIdle,
    hipsRot: [0, 0.1, 0],
    spineRot: [-0.03, -0.06, 0],
    headRot: [-0.1, 0.06, 0.08],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.45 + pump * 0.3, 0, 0.45],
    rightLowerArmRot: [0, -1.75 - pump * 0.4, -0.2],
    rightHandRot:     [0.25, 0, 0],
    rightFingers:     'fist',
    expressions: { happy: 1.0 },
  };
}

// ── 45. Giggle ────────────────────────────────────────────────────────────────
export function getLaughPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const chuckle = Math.sin(t * 12.0) * 0.025;
  return {
    ...baseIdle,
    spineRot: [0.06 + chuckle, 0, 0],
    chestRot: [0.04 + chuckle * 1.5, 0, 0],
    headRot: [-0.12 + chuckle * 0.8, Math.sin(t * 3.0) * 0.04, 0.06],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.65, -0.15, 0.45],
    rightLowerArmRot: [0, -2.1, -0.22],
    rightHandRot:     [0.25, 0, 0],
    rightFingers:     'relaxed',
    expressions: { happy: 1.0 },
  };
}

// ── 46. Full Laugh ────────────────────────────────────────────────────────────
export function getLaughFullPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const laugh = Math.sin(t * 14.0) * 0.035;
  return {
    ...baseIdle,
    spineRot: [-0.1 + laugh, 0, 0],
    chestRot: [0.08 + laugh * 1.5, 0, 0],
    headRot: [-0.22 + laugh, 0, 0],
    leftUpperArmRot:  [0.45, 0.15, -0.85],
    leftLowerArmRot:  [0, 1.65, 0.15],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.45, -0.15, 0.85],
    rightLowerArmRot: [0, -1.65, -0.15],
    rightFingers:     'relaxed',
    expressions: { happy: 1.0 },
  };
}

// ── 47. Happy Little Dance ────────────────────────────────────────────────────
export function getDancePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const beat = t * 4.4;
  const danceSway = Math.sin(beat);
  const danceStep = Math.cos(beat);
  const bounce = Math.abs(Math.sin(beat * 2.0));

  return {
    ...baseIdle,
    hipsPos: [danceSway * 0.05, bounce * 0.02, 0],
    hipsRot: [0, danceStep * 0.08, danceSway * 0.07],
    spineRot: [0.03, -danceStep * 0.05, -danceSway * 0.05],
    chestRot: [bounce * 0.02, danceStep * 0.03, 0],
    headRot: [
      bounce * 0.06,
      -danceSway * 0.18,
      danceSway * 0.1,
    ],
    leftUpperArmRot:  [0.25, 0, -1.05 + danceStep * 0.3],
    leftLowerArmRot:  [0, 0.65 + bounce * 0.2, 0],
    leftHandRot:      [danceSway * 0.15, 0, 0],
    leftFingers:      'open',
    rightUpperArmRot: [0.25, 0, 1.05 - danceStep * 0.3],
    rightLowerArmRot: [0, -0.65 - bounce * 0.2, 0],
    rightHandRot:     [-danceSway * 0.15, 0, 0],
    rightFingers:     'open',
    leftUpperLegRot:  [-0.04 + danceStep * 0.04, 0, -danceSway * 0.04],
    rightUpperLegRot: [-0.04 - danceStep * 0.04, 0, -danceSway * 0.04],
    leftLowerLegRot:  [0.06 + Math.max(0, danceSway) * 0.08, 0, 0],
    rightLowerLegRot: [0.06 + Math.max(0, -danceSway) * 0.08, 0, 0],
    expressions: { happy: 0.95 },
  };
}

// ── 48. Two Thumbs Up ─────────────────────────────────────────────────────────
export function getThumbsUpDoublePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const bounce = Math.sin(actTime * 5.0) * 0.03;
  return {
    ...baseIdle,
    spineRot: [0.02, 0, 0],
    headRot: [-0.04 + bounce, 0, 0],
    leftUpperArmRot:  [0.35, 0, -1.05],
    leftLowerArmRot:  [0, 1.45 + bounce, 0.15],
    leftHandRot:      [0.15, 0, -0.1],
    leftFingers:      'thumbs_up',
    rightUpperArmRot: [0.35, 0, 1.05],
    rightLowerArmRot: [0, -1.45 - bounce, -0.15],
    rightHandRot:     [0.15, 0, 0.1],
    rightFingers:     'thumbs_up',
    expressions: { happy: 1.0 },
  };
}

// ── 49. Single Thumb Up ───────────────────────────────────────────────────────
export function getThumbsUpSinglePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.04, 0.06, 0.1],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.35, 0, 1.05],
    rightLowerArmRot: [0, -1.45, -0.15],
    rightHandRot:     [0.15, 0, 0.1],
    rightFingers:     'thumbs_up',
    expressions: { happy: 0.9 },
  };
}

// ── 50. Sparkly Eyes Reaction ─────────────────────────────────────────────────
export function getSparklyEyesPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const shimmer = Math.sin(t * 8.0) * 0.02;
  return {
    ...baseIdle,
    spineRot: [0.05, 0, 0],
    chestRot: [0.04, 0, 0],
    headRot: [-0.12, shimmer, 0.04],
    leftUpperArmRot:  [0.45, 0.15, -0.92],
    leftLowerArmRot:  [0, 1.65, 0.22],
    leftHandRot:      [0.2, 0, -0.1],
    leftFingers:      'clasped',
    rightUpperArmRot: [0.45, -0.15, 0.92],
    rightLowerArmRot: [0, -1.65, -0.22],
    rightHandRot:     [0.2, 0, 0.1],
    rightFingers:     'clasped',
    expressions: { happy: 1.0, surprised: 0.6 },
  };
}

// ── 51. High Five ─────────────────────────────────────────────────────────────
export function getHighFivePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = Math.sin(Math.min(actTime / 3.0, 1) * Math.PI);
  return {
    ...baseIdle,
    headRot: [-0.04, 0.04, 0.06],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.45 * p, 0, MathUtils.lerp(1.28, 0.15, p)],
    rightLowerArmRot: [0, -0.45 * p, 0],
    rightHandRot:     [0.15, 0, 0],
    rightFingers:     'open',
    expressions: { happy: 0.95 },
  };
}

// ── 52. Peace Sign Pose ───────────────────────────────────────────────────────
export function getPeacePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const bounce = Math.sin(actTime * 4.0) * 0.02;
  return {
    ...baseIdle,
    hipsRot: [0, 0, 0.04 + bounce],
    headRot: [-0.04, 0.04, 0.14],
    leftUpperArmRot: [0.08, 0, -1.28],
    leftLowerArmRot: [0, 0.22, 0],
    leftFingers:     'relaxed',
    rightUpperArmRot: [0.38, 0, 0.65],
    rightLowerArmRot: [0, -1.45, -0.35],
    rightHandRot:     [0, 0, 0.15],
    rightFingers:     'peace',
    expressions: { happy: 0.95 },
  };
}

// ── 53. Cheering ──────────────────────────────────────────────────────────────
export function getCheerPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const hop = Math.abs(Math.sin(t * 7.5));
  return {
    ...baseIdle,
    hipsPos: [0, hop * 0.03, 0],
    spineRot: [-0.05, 0, 0],
    headRot: [-0.18, 0, 0],
    leftShoulderRot:  [0, 0, 0.15],
    rightShoulderRot: [0, 0, -0.15],
    leftUpperArmRot:  [0.25, 0, 1.85],
    leftLowerArmRot:  [0, 0.55 + hop * 0.2, 0],
    leftFingers:      'fist',
    rightUpperArmRot: [0.25, 0, -1.85],
    rightLowerArmRot: [0, -0.55 - hop * 0.2, 0],
    rightFingers:     'fist',
    expressions: { happy: 1.0 },
  };
}
