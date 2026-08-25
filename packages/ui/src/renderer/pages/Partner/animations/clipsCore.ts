import { MathUtils } from 'three';
import type { VRMPose } from './types';

// ── 1. Standard Standing Idle ──────────────────────────────────────────────────
export function getIdlePose(t: number, gazeX: number = 0, gazeY: number = 0): VRMPose {
  const breath = Math.sin(t * 1.5);
  const swaySide = Math.sin(t * 0.4);
  const swayRot = Math.cos(t * 0.4);

  return {
    hipsPos: [swaySide * 0.012, breath * 0.005, 0],
    hipsRot: [0, swayRot * 0.015, swaySide * 0.015],
    spineRot: [0.02 + breath * 0.018, -swayRot * 0.012, -swaySide * 0.012],
    chestRot: [breath * 0.02, swaySide * 0.008, 0],
    upperChestRot: [breath * 0.012, 0, 0],
    neckRot: [-0.01 + breath * 0.008, gazeX * 0.25, gazeY * 0.15],
    headRot: [
      -gazeY * 0.35 + Math.sin(t * 0.6) * 0.02,
      gazeX * 0.45 + swayRot * 0.02,
      -gazeX * 0.1 + Math.sin(t * 0.45) * 0.015,
    ],
    leftShoulderRot: [0, 0, 0.02 + breath * 0.015],
    rightShoulderRot: [0, 0, -0.02 - breath * 0.015],
    leftUpperArmRot: [0.08 + breath * 0.012, 0, -1.28 + swaySide * 0.02],
    leftLowerArmRot: [0, 0.22, 0],
    leftHandRot:     [0, 0.06, -0.04],
    leftFingers:     'relaxed',
    rightUpperArmRot: [0.08 + breath * 0.012, 0, 1.28 - swaySide * 0.02],
    rightLowerArmRot: [0, -0.22, 0],
    rightHandRot:     [0, -0.06, 0.04],
    rightFingers:     'relaxed',
    leftUpperLegRot:  [-0.02, 0.02, -swaySide * 0.02],
    rightUpperLegRot: [-0.02, -0.02, -swaySide * 0.02],
    leftLowerLegRot:  [0.05, 0, 0],
    rightLowerLegRot: [0.05, 0, 0],
    leftFootRot:      [0, 0, swaySide * 0.015],
    rightFootRot:     [0, 0, swaySide * 0.015],
  };
}

// ── 2. Relaxed Standing ───────────────────────────────────────────────────────
export function getIdleRelaxedPose(t: number, baseIdle: VRMPose): VRMPose {
  const breath = Math.sin(t * 1.4) * 0.02;
  return {
    ...baseIdle,
    hipsPos: [-0.03, -0.01, 0],
    hipsRot: [0, 0.04, -0.06],
    spineRot: [0.03, -0.03, 0.05],
    chestRot: [breath, 0, 0],
    headRot: [-0.02, 0.06, 0.06],
    leftUpperArmRot:  [0.08, 0, -1.26],
    leftLowerArmRot:  [0, 0.25, 0],
    leftHandRot:      [0, 0.06, -0.05],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.12, 0, 1.22],
    rightLowerArmRot: [0, -0.38, 0],
    rightHandRot:     [0, -0.08, 0.06],
    rightFingers:     'relaxed',
    leftUpperLegRot:  [-0.06, 0.04, -0.04],
    rightUpperLegRot: [0.03, -0.06, 0.09],
    leftLowerLegRot:  [0.1, 0, 0],
    rightLowerLegRot: [0.02, 0, 0],
  };
}

// ── 3. Hands Behind Back Idle ─────────────────────────────────────────────────
export function getIdleBehindBackPose(t: number, baseIdle: VRMPose): VRMPose {
  const sway = Math.sin(t * 1.8) * 0.03;
  return {
    ...baseIdle,
    hipsRot: [0, sway * 0.5, sway],
    spineRot: [0.05, 0, -sway * 0.4],
    headRot: [-0.05, sway * 0.6, -0.06],
    leftUpperArmRot:  [-0.15, -0.15, -1.18],
    leftLowerArmRot:  [0, 0.95, -0.15],
    leftHandRot:      [0.15, 0.1, -0.15],
    leftFingers:      'clasped',
    rightUpperArmRot: [-0.15, 0.15, 1.18],
    rightLowerArmRot: [0, -0.95, 0.15],
    rightHandRot:     [0.15, -0.1, 0.15],
    rightFingers:     'clasped',
    expressions: { happy: 0.45, relaxed: 0.5 },
  };
}

// ── 4. Hands on Hips Idle ─────────────────────────────────────────────────────
export function getIdleHipsPose(t: number, baseIdle: VRMPose): VRMPose {
  const breath = Math.sin(t * 1.6) * 0.02;
  return {
    ...baseIdle,
    spineRot: [-0.02 + breath, 0, 0],
    chestRot: [0.04, 0, 0],
    headRot: [0.02, 0.04, 0.03],
    leftUpperArmRot:  [-0.12, -0.25, -1.12],
    leftLowerArmRot:  [0, 1.35, 0.2],
    leftHandRot:      [0.25, 0, -0.25],
    leftFingers:      'fist',
    rightUpperArmRot: [-0.12, 0.25, 1.12],
    rightLowerArmRot: [0, -1.35, -0.2],
    rightHandRot:     [0.25, 0, 0.25],
    rightFingers:     'fist',
    leftUpperLegRot:  [-0.03, 0.04, 0.05],
    rightUpperLegRot: [-0.03, -0.04, -0.05],
    expressions: { happy: 0.35, relaxed: 0.4 },
  };
}

// ── 5. Arms Crossed Idle ──────────────────────────────────────────────────────
export function getIdleArmsCrossedPose(t: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.03, 0, 0],
    headRot: [-0.02, -0.04, 0.04],
    leftUpperArmRot:  [0.55, 0.15, -1.02],
    leftLowerArmRot:  [0, 1.78, 0.22],
    leftHandRot:      [0, 0.15, -0.08],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.58, -0.15, 1.02],
    rightLowerArmRot: [0, -1.78, -0.22],
    rightHandRot:     [0, -0.15, 0.08],
    rightFingers:     'relaxed',
    expressions: { neutral: 0.6, relaxed: 0.3 },
  };
}

// ── 6. Thinking Idle ──────────────────────────────────────────────────────────
export function getThinkingPose(t: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.04, -0.04, -0.02],
    headRot: [-0.08, -0.14, -0.1],
    leftUpperArmRot:  [0.15, 0, -1.18],
    leftLowerArmRot:  [0, 0.45, 0],
    leftHandRot:      [0, 0.06, -0.04],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.65, -0.15, 0.45],
    rightLowerArmRot: [0, -1.95, -0.25],
    rightHandRot:     [0.25, 0, 0.12],
    rightFingers:     'relaxed',
    expressions: { neutral: 0.6, lookUp: 0.45 },
  };
}

// ── 7. Waiting Impatiently ────────────────────────────────────────────────────
export function getIdleWaitingPose(t: number, baseIdle: VRMPose): VRMPose {
  const tap = Math.sin(t * 7.0);
  const look = Math.sin(t * 1.2) * 0.22;
  return {
    ...baseIdle,
    spineRot: [0.03, look * 0.15, 0],
    headRot: [-0.04, look, 0.04],
    leftUpperArmRot:  [-0.12, -0.25, -1.12],
    leftLowerArmRot:  [0, 1.35, 0.2],
    leftFingers:      'fist',
    rightUpperArmRot: [0.08, 0, 1.25],
    rightLowerArmRot: [0, -0.25, 0],
    rightFingers:     'relaxed',
    rightFootRot:     [Math.max(0, tap) * 0.22, 0, 0],
    expressions: { neutral: 0.7, lookDown: 0.2 },
  };
}

// ── 8. Sitting Idle (Chair) ───────────────────────────────────────────────────
export function getIdleSittingChairPose(t: number, baseIdle: VRMPose): VRMPose {
  const breath = Math.sin(t * 1.5) * 0.015;
  return {
    ...baseIdle,
    hipsPos: [0, -0.42, 0],
    spineRot: [0.05 + breath, 0, 0],
    chestRot: [0.03, 0, 0],
    headRot: [-0.02, 0, 0],
    leftUpperArmRot:  [0.15, 0, -1.22],
    leftLowerArmRot:  [0, 0.82, 0],
    leftHandRot:      [0.15, 0, -0.05],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.15, 0, 1.22],
    rightLowerArmRot: [0, -0.82, 0],
    rightHandRot:     [0.15, 0, 0.05],
    rightFingers:     'relaxed',
    leftUpperLegRot:  [-1.52, 0.06, 0.04],
    rightUpperLegRot: [-1.52, -0.06, -0.04],
    leftLowerLegRot:  [1.52, 0, 0],
    rightLowerLegRot: [1.52, 0, 0],
    leftFootRot:      [-0.08, 0, 0],
    rightFootRot:     [-0.08, 0, 0],
    expressions: { happy: 0.4, relaxed: 0.6 },
  };
}

// ── 9. Sitting Idle (Floor) ───────────────────────────────────────────────────
export function getIdleSittingFloorPose(t: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    hipsPos: [0, -0.76, 0],
    spineRot: [0.1, 0, 0],
    headRot: [-0.06, 0, 0],
    leftUpperArmRot:  [0.2, 0, -1.18],
    leftLowerArmRot:  [0, 0.95, 0],
    leftHandRot:      [0.15, 0, -0.08],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.2, 0, 1.18],
    rightLowerArmRot: [0, -0.95, 0],
    rightHandRot:     [0.15, 0, 0.08],
    rightFingers:     'relaxed',
    leftUpperLegRot:  [-1.4, 0.45, -0.45],
    rightUpperLegRot: [-1.4, -0.45, 0.45],
    leftLowerLegRot:  [2.1, 0, 0],
    rightLowerLegRot: [2.1, 0, 0],
    leftFootRot:      [0.15, 0, 0],
    rightFootRot:     [0.15, 0, 0],
    expressions: { happy: 0.5, relaxed: 0.5 },
  };
}

// ── 10. Stretching Idle ───────────────────────────────────────────────────────
export function getIdleStretchingPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = (actTime % 5.0) / 5.0;
  const raise = Math.sin(p * Math.PI);
  return {
    ...baseIdle,
    spineRot: [-0.12 * raise, 0, 0],
    chestRot: [0.08 * raise, 0, 0],
    headRot: [-0.2 * raise, 0, 0],
    leftShoulderRot:  [0, 0, 0.15 * raise],
    rightShoulderRot: [0, 0, -0.15 * raise],
    leftUpperArmRot:  [0.25 * raise, 0, MathUtils.lerp(-1.28, 2.05, raise)],
    leftLowerArmRot:  [0, 0.35 * raise, 0],
    leftFingers:      'open',
    rightUpperArmRot: [0.25 * raise, 0, MathUtils.lerp(1.28, -2.05, raise)],
    rightLowerArmRot: [0, -0.35 * raise, 0],
    rightFingers:     'open',
    expressions: { relaxed: 0.8 },
  };
}

// ── 11. Sleepy Idle ───────────────────────────────────────────────────────────
export function getIdleSleepyPose(t: number, baseIdle: VRMPose): VRMPose {
  const slowSway = Math.sin(t * 0.7) * 0.04;
  const headDrop = Math.sin(t * 0.5) * 0.06 + 0.1;
  return {
    ...baseIdle,
    hipsRot: [0, 0, slowSway],
    spineRot: [0.06, 0, -slowSway],
    headRot: [headDrop, 0, slowSway * 0.6],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.2, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.2, 0],
    rightFingers:     'relaxed',
    expressions: { relaxed: 0.9, lookDown: 0.35 },
  };
}

// ── 12. Curious Idle ──────────────────────────────────────────────────────────
export function getIdleCuriousPose(t: number, baseIdle: VRMPose): VRMPose {
  const lookTilt = Math.sin(t * 1.5) * 0.1;
  return {
    ...baseIdle,
    spineRot: [0.12, 0, 0],
    chestRot: [0.06, 0, 0],
    headRot: [-0.08, lookTilt * 0.5, lookTilt],
    leftUpperArmRot:  [0.12, 0, -1.22],
    leftLowerArmRot:  [0, 0.45, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.12, 0, 1.22],
    rightLowerArmRot: [0, -0.45, 0],
    rightFingers:     'relaxed',
    expressions: { surprised: 0.35, happy: 0.4 },
  };
}
