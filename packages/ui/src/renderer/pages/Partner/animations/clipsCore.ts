import { MathUtils } from 'three';
import type { VRMPose } from './types';

// ── 1. Standard Standing Idle ──────────────────────────────────────────────────
export function getIdlePose(t: number, gazeX: number = 0, gazeY: number = 0): VRMPose {
  const breath = Math.sin(t * 1.5);
  const swaySide = Math.sin(t * 0.4);
  const swayRot = Math.cos(t * 0.4);

  return {
    hipsPos: [swaySide * 0.012, breath * 0.004, 0],
    hipsRot: [0, swayRot * 0.012, swaySide * 0.012],
    spineRot: [0.02 + breath * 0.014, -swayRot * 0.01, -swaySide * 0.01],
    chestRot: [breath * 0.015, swaySide * 0.006, 0],
    upperChestRot: [breath * 0.01, 0, 0],
    neckRot: [-0.01 + breath * 0.006, gazeX * 0.2, gazeY * 0.12],
    headRot: [
      -gazeY * 0.3 + Math.sin(t * 0.6) * 0.02,
      gazeX * 0.4 + swayRot * 0.015,
      -gazeX * 0.08 + Math.sin(t * 0.45) * 0.012,
    ],
    leftShoulderRot: [0, 0, 0.02 + breath * 0.012],
    rightShoulderRot: [0, 0, -0.02 - breath * 0.012],
    leftUpperArmRot: [0.08 + breath * 0.008, -0.04, -1.28 + swaySide * 0.015],
    leftLowerArmRot: [0, -0.22, 0],
    leftHandRot:     [0.04, -0.04, -0.02],
    leftFingers:     'relaxed',
    rightUpperArmRot: [0.08 + breath * 0.008, 0.04, 1.28 - swaySide * 0.015],
    rightLowerArmRot: [0, 0.22, 0],
    rightHandRot:     [0.04, 0.04, 0.02],
    rightFingers:     'relaxed',
    leftUpperLegRot:  [-0.02, 0.02, -0.02 - swaySide * 0.015],
    rightUpperLegRot: [-0.02, -0.02, 0.02 - swaySide * 0.015],
    leftLowerLegRot:  [0.05, 0, 0],
    rightLowerLegRot: [0.05, 0, 0],
    leftFootRot:      [0, 0, swaySide * 0.01],
    rightFootRot:     [0, 0, swaySide * 0.01],
  };
}

// ── 2. Relaxed Standing ───────────────────────────────────────────────────────
export function getIdleRelaxedPose(t: number, baseIdle: VRMPose): VRMPose {
  const breath = Math.sin(t * 1.4) * 0.015;
  return {
    ...baseIdle,
    hipsPos: [-0.025, -0.008, 0],
    hipsRot: [0, 0.03, -0.05],
    spineRot: [0.02, -0.02, 0.04],
    chestRot: [breath, 0, 0],
    headRot: [-0.02, 0.05, 0.05],
    leftUpperArmRot:  [0.08, -0.04, -1.26],
    leftLowerArmRot:  [0, -0.25, 0],
    leftHandRot:      [0.04, -0.04, -0.02],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.10, 0.04, 1.24],
    rightLowerArmRot: [0, 0.32, 0],
    rightHandRot:     [0.04, 0.04, 0.02],
    rightFingers:     'relaxed',
    leftUpperLegRot:  [-0.04, 0.03, -0.03],
    rightUpperLegRot: [0.02, -0.05, 0.06],
    leftLowerLegRot:  [0.08, 0, 0],
    rightLowerLegRot: [0.02, 0, 0],
  };
}

// ── 3. Hands Behind Back Idle ─────────────────────────────────────────────────
export function getIdleBehindBackPose(t: number, baseIdle: VRMPose): VRMPose {
  const sway = Math.sin(t * 1.8) * 0.025;
  return {
    ...baseIdle,
    hipsRot: [0, sway * 0.4, sway],
    spineRot: [0.04, 0, -sway * 0.3],
    headRot: [-0.04, sway * 0.5, -0.05],
    leftUpperArmRot:  [-0.18, -0.15, -1.25],
    leftLowerArmRot:  [0, -0.85, 0.15],
    leftHandRot:      [0.12, 0.08, -0.10],
    leftFingers:      'clasped',
    rightUpperArmRot: [-0.18, 0.15, 1.25],
    rightLowerArmRot: [0, 0.85, -0.15],
    rightHandRot:     [0.12, -0.08, 0.10],
    rightFingers:     'clasped',
    expressions: { happy: 0.45, relaxed: 0.5 },
  };
}

// ── 4. Hands on Hips Idle ─────────────────────────────────────────────────────
export function getIdleHipsPose(t: number, baseIdle: VRMPose): VRMPose {
  const breath = Math.sin(t * 1.6) * 0.015;
  return {
    ...baseIdle,
    spineRot: [-0.02 + breath, 0, 0],
    chestRot: [0.03, 0, 0],
    headRot: [0.02, 0.03, 0.02],
    leftUpperArmRot:  [-0.10, -0.22, -0.95],
    leftLowerArmRot:  [0, -1.55, -0.20],
    leftHandRot:      [0.15, 0, -0.15],
    leftFingers:      'fist',
    rightUpperArmRot: [-0.10, 0.22, 0.95],
    rightLowerArmRot: [0, 1.55, 0.20],
    rightHandRot:     [0.15, 0, 0.15],
    rightFingers:     'fist',
    leftUpperLegRot:  [-0.03, 0.03, 0.04],
    rightUpperLegRot: [-0.03, -0.03, -0.04],
    expressions: { happy: 0.35, relaxed: 0.4 },
  };
}

// ── 5. Arms Crossed Idle ──────────────────────────────────────────────────────
export function getIdleArmsCrossedPose(t: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.03, 0, 0],
    headRot: [-0.02, -0.03, 0.03],
    leftUpperArmRot:  [0.48, 0.15, -0.85],
    leftLowerArmRot:  [0, -1.82, -0.20],
    leftHandRot:      [0.08, 0.10, -0.05],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.52, -0.15, 0.85],
    rightLowerArmRot: [0, 1.82, 0.20],
    rightHandRot:     [0.08, -0.10, 0.05],
    rightFingers:     'relaxed',
    expressions: { neutral: 0.6, relaxed: 0.3 },
  };
}

// ── 6. Thinking Idle ──────────────────────────────────────────────────────────
export function getThinkingPose(t: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.03, -0.04, -0.02],
    headRot: [-0.06, -0.12, -0.08],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftHandRot:      [0.04, -0.04, -0.02],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.62, -0.15, 0.42],
    rightLowerArmRot: [0, 2.05, 0.18],
    rightHandRot:     [0.20, 0, 0.08],
    rightFingers:     'relaxed',
    expressions: { neutral: 0.6, lookUp: 0.45 },
  };
}

// ── 7. Waiting Impatiently ────────────────────────────────────────────────────
export function getIdleWaitingPose(t: number, baseIdle: VRMPose): VRMPose {
  const tap = Math.sin(t * 7.0);
  const look = Math.sin(t * 1.2) * 0.18;
  return {
    ...baseIdle,
    spineRot: [0.02, look * 0.12, 0],
    headRot: [-0.03, look, 0.03],
    leftUpperArmRot:  [-0.10, -0.22, -0.95],
    leftLowerArmRot:  [0, -1.55, -0.20],
    leftFingers:      'fist',
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    rightFingers:     'relaxed',
    rightFootRot:     [Math.max(0, tap) * 0.20, 0, 0],
    expressions: { neutral: 0.7, lookDown: 0.2 },
  };
}

// ── 8. Sitting Idle (Chair) ───────────────────────────────────────────────────
export function getIdleSittingChairPose(t: number, baseIdle: VRMPose): VRMPose {
  const breath = Math.sin(t * 1.5) * 0.012;
  return {
    ...baseIdle,
    hipsPos: [0, -0.42, 0],
    spineRot: [0.04 + breath, 0, 0],
    chestRot: [0.02, 0, 0],
    headRot: [-0.02, 0, 0],
    leftUpperArmRot:  [0.15, 0, -1.25],
    leftLowerArmRot:  [0, -0.85, 0],
    leftHandRot:      [0.10, 0, -0.05],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.15, 0, 1.25],
    rightLowerArmRot: [0, 0.85, 0],
    rightHandRot:     [0.10, 0, 0.05],
    rightFingers:     'relaxed',
    leftUpperLegRot:  [-1.48, 0.05, 0.03],
    rightUpperLegRot: [-1.48, -0.05, -0.03],
    leftLowerLegRot:  [1.48, 0, 0],
    rightLowerLegRot: [1.48, 0, 0],
    leftFootRot:      [-0.05, 0, 0],
    rightFootRot:     [-0.05, 0, 0],
    expressions: { happy: 0.4, relaxed: 0.6 },
  };
}

// ── 9. Sitting Idle (Floor) ───────────────────────────────────────────────────
export function getIdleSittingFloorPose(t: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    hipsPos: [0, -0.72, 0],
    spineRot: [0.08, 0, 0],
    headRot: [-0.05, 0, 0],
    leftUpperArmRot:  [0.18, 0, -1.22],
    leftLowerArmRot:  [0, -0.95, 0],
    leftHandRot:      [0.12, 0, -0.06],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.18, 0, 1.22],
    rightLowerArmRot: [0, 0.95, 0],
    rightHandRot:     [0.12, 0, 0.06],
    rightFingers:     'relaxed',
    leftUpperLegRot:  [-1.35, 0.40, -0.40],
    rightUpperLegRot: [-1.35, -0.40, 0.40],
    leftLowerLegRot:  [1.95, 0, 0],
    rightLowerLegRot: [1.95, 0, 0],
    leftFootRot:      [0.10, 0, 0],
    rightFootRot:     [0.10, 0, 0],
    expressions: { happy: 0.5, relaxed: 0.5 },
  };
}

// ── 10. Stretching Idle ───────────────────────────────────────────────────────
export function getIdleStretchingPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = (actTime % 5.0) / 5.0;
  const raise = Math.sin(p * Math.PI);
  return {
    ...baseIdle,
    spineRot: [-0.10 * raise, 0, 0],
    chestRot: [0.06 * raise, 0, 0],
    headRot: [-0.18 * raise, 0, 0],
    leftShoulderRot:  [0, 0, 0.15 * raise],
    rightShoulderRot: [0, 0, -0.15 * raise],
    leftUpperArmRot:  [0.15 * raise, 0, MathUtils.lerp(-1.28, 1.95, raise)],
    leftLowerArmRot:  [0, -0.35 * raise, 0],
    leftFingers:      'open',
    rightUpperArmRot: [0.15 * raise, 0, MathUtils.lerp(1.28, -1.95, raise)],
    rightLowerArmRot: [0, 0.35 * raise, 0],
    rightFingers:     'open',
    expressions: { relaxed: 0.8 },
  };
}

// ── 11. Sleepy Idle ───────────────────────────────────────────────────────────
export function getIdleSleepyPose(t: number, baseIdle: VRMPose): VRMPose {
  const slowSway = Math.sin(t * 0.7) * 0.03;
  const headDrop = Math.sin(t * 0.5) * 0.05 + 0.08;
  return {
    ...baseIdle,
    hipsRot: [0, 0, slowSway],
    spineRot: [0.05, 0, -slowSway],
    headRot: [headDrop, 0, slowSway * 0.5],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.20, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.20, 0],
    rightFingers:     'relaxed',
    expressions: { relaxed: 0.9, lookDown: 0.35 },
  };
}

// ── 12. Curious Idle ──────────────────────────────────────────────────────────
export function getIdleCuriousPose(t: number, baseIdle: VRMPose): VRMPose {
  const lookTilt = Math.sin(t * 1.5) * 0.08;
  return {
    ...baseIdle,
    spineRot: [0.08, 0, 0],
    chestRot: [0.04, 0, 0],
    headRot: [-0.05, lookTilt * 0.5, lookTilt],
    leftUpperArmRot:  [0.10, -0.04, -1.25],
    leftLowerArmRot:  [0, -0.40, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.10, 0.04, 1.25],
    rightLowerArmRot: [0, 0.40, 0],
    rightFingers:     'relaxed',
    expressions: { surprised: 0.35, happy: 0.4 },
  };
}
