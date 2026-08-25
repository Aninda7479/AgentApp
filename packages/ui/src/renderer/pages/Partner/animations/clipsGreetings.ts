import { MathUtils } from 'three';
import type { VRMPose } from './types';

// ── 13. Standard Wave ─────────────────────────────────────────────────────────
export function getWavePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const waveCycle = Math.sin(actTime * 7.5);
  const bodyTurn = Math.sin(actTime * 1.8) * 0.05;

  return {
    ...baseIdle,
    hipsRot: [0, 0.06 + bodyTurn, 0.02],
    spineRot: [0.02, -0.04, -0.02],
    headRot: [
      (baseIdle.headRot?.[0] || 0) - 0.05,
      (baseIdle.headRot?.[1] || 0) + 0.06,
      0.1,
    ],
    leftUpperArmRot: [0.08, 0, -1.28],
    leftLowerArmRot: [0, 0.22, 0],
    leftHandRot:     [0, 0.06, -0.04],
    leftFingers:     'relaxed',
    rightUpperArmRot: [0.32, 0, 0.65],
    rightLowerArmRot: [0, -1.35, -0.45 + waveCycle * 0.25],
    rightHandRot:     [0, -0.15, waveCycle * 0.35],
    rightFingers:     'open',
    expressions: { happy: 0.95 },
  };
}

// ── 14. Energetic Wave ────────────────────────────────────────────────────────
export function getWaveEnergeticPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const hop = Math.abs(Math.sin(actTime * 8.5)) * 0.04;
  const waveL = Math.sin(actTime * 9.0) * 0.3;
  const waveR = Math.sin(actTime * 9.0 + Math.PI * 0.5) * 0.3;

  return {
    ...baseIdle,
    hipsPos: [0, hop, 0],
    spineRot: [-0.03, 0, 0],
    headRot: [-0.08, 0, 0],
    leftShoulderRot:  [0, 0, 0.12],
    rightShoulderRot: [0, 0, -0.12],
    leftUpperArmRot:  [0.25, 0, 1.85],
    leftLowerArmRot:  [0, 0.65 + waveL, 0],
    leftHandRot:      [0, 0, waveL * 0.35],
    leftFingers:      'open',
    rightUpperArmRot: [0.25, 0, -1.85],
    rightLowerArmRot: [0, -0.65 + waveR, 0],
    rightHandRot:     [0, 0, -waveR * 0.35],
    rightFingers:     'open',
    expressions: { happy: 1.0, surprised: 0.2 },
  };
}

// ── 15. Shy Wave ──────────────────────────────────────────────────────────────
export function getWaveShyPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const miniWave = Math.sin(actTime * 6.0) * 0.2;
  return {
    ...baseIdle,
    headRot: [0.12, -0.08, 0.1],
    spineRot: [0.03, -0.04, 0],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.45, 0, 0.85],
    rightLowerArmRot: [0, -1.65, -0.15 + miniWave * 0.2],
    rightHandRot:     [0.15, 0, miniWave * 0.3],
    rightFingers:     'open',
    expressions: { relaxed: 0.6, happy: 0.5 },
  };
}

// ── 16. Formal Bow ────────────────────────────────────────────────────────────
export function getBowPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const bowProg = Math.sin(Math.min(actTime / 3.2, 1) * Math.PI);
  const bend = MathUtils.clamp(bowProg * 0.52, 0, 0.52);

  return {
    ...baseIdle,
    hipsRot: [bend * 0.35, 0, 0],
    spineRot: [bend, 0, 0],
    headRot:  [bend * 0.3, 0, 0],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.25, 0],
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.25, 0],
    leftFingers:      'salute',
    rightFingers:     'salute',
    expressions: { neutral: 1.0 },
  };
}

// ── 17. Casual Nod ────────────────────────────────────────────────────────────
export function getNodCasualPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const nod = Math.sin(actTime * 6.0) * 0.16;
  return {
    ...baseIdle,
    headRot: [nod, 0.05, 0.06],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.25, 0, 1.15],
    rightLowerArmRot: [0, -0.65, 0],
    rightFingers:     'open',
    expressions: { happy: 0.75 },
  };
}

// ── 18. Air Hug Greeting ──────────────────────────────────────────────────────
export function getAirHugPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const pulse = Math.sin(actTime * 3.0) * 0.05;
  return {
    ...baseIdle,
    spineRot: [0.05, 0, 0],
    chestRot: [0.04, 0, 0],
    headRot: [-0.05, 0, 0.06],
    leftUpperArmRot:  [0.35, 0, -0.95 + pulse],
    leftLowerArmRot:  [0, 0.95, 0],
    leftHandRot:      [0.1, 0, -0.15],
    leftFingers:      'open',
    rightUpperArmRot: [0.35, 0, 0.95 - pulse],
    rightLowerArmRot: [0, -0.95, 0],
    rightHandRot:     [0.1, 0, 0.15],
    rightFingers:     'open',
    expressions: { happy: 0.95, relaxed: 0.4 },
  };
}

// ── 19. Blowing a Kiss Greeting ───────────────────────────────────────────────
export function getKissGreetingPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const phase = (actTime % 3.8) / 3.8;
  if (phase < 0.45) {
    // Hand brought gently to lips
    return {
      ...baseIdle,
      headRot: [-0.05, 0.04, 0.08],
      leftUpperArmRot:  [0.08, 0, -1.28],
      leftLowerArmRot:  [0, 0.22, 0],
      rightUpperArmRot: [0.65, -0.1, 0.45],
      rightLowerArmRot: [0, -2.1, -0.2],
      rightHandRot:     [0.25, 0, 0.1],
      rightFingers:     'relaxed',
      expressions: { happy: 0.85 },
    };
  } else {
    // Blow and open hand outward to viewer
    const release = MathUtils.smoothstep((phase - 0.45) / 0.55, 0, 1);
    return {
      ...baseIdle,
      headRot: [-0.06, 0.05, 0.1],
      leftUpperArmRot:  [0.08, 0, -1.28],
      leftLowerArmRot:  [0, 0.22, 0],
      rightUpperArmRot: [MathUtils.lerp(0.65, 0.45, release), 0, MathUtils.lerp(0.45, 0.85, release)],
      rightLowerArmRot: [0, MathUtils.lerp(-2.1, -0.65, release), 0],
      rightHandRot:     [0.1, 0, 0],
      rightFingers:     'open',
      expressions: { happy: 1.0 },
    };
  }
}

// ── 20. Sleepy Good Morning ───────────────────────────────────────────────────
export function getGoodMorningPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const rub = Math.sin(actTime * 6.0) * 0.06;
  return {
    ...baseIdle,
    headRot: [0.06, 0, 0],
    leftUpperArmRot:  [0.45, 0, -0.85],
    leftLowerArmRot:  [0, 1.85 + rub, 0.15],
    leftFingers:      'fist',
    rightUpperArmRot: [0.45, 0, 0.85],
    rightLowerArmRot: [0, -1.85 - rub, -0.15],
    rightFingers:     'fist',
    expressions: { relaxed: 0.85, lookDown: 0.3 },
  };
}

// ── 21. Standard Goodbye Wave ─────────────────────────────────────────────────
export function getGoodbyeWavePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const slowWave = Math.sin(actTime * 4.5) * 0.3;
  return {
    ...baseIdle,
    headRot: [-0.04, 0.05, 0.08],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.32, 0, 0.65],
    rightLowerArmRot: [0, -1.35, -0.45 + slowWave * 0.2],
    rightHandRot:     [0, -0.15, slowWave * 0.35],
    rightFingers:     'open',
    expressions: { happy: 0.75, relaxed: 0.4 },
  };
}

// ── 22. Reluctant Goodbye ─────────────────────────────────────────────────────
export function getGoodbyeReluctantPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const wave = Math.sin(actTime * 4.0) * 0.22;
  return {
    ...baseIdle,
    hipsRot: [0, 0.35, 0],
    spineRot: [0.04, -0.25, 0],
    headRot: [-0.04, -0.3, -0.1],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.35, 0, 0.95],
    rightLowerArmRot: [0, -1.15, 0.15 + wave * 0.15],
    rightHandRot:     [0.1, 0, wave * 0.3],
    rightFingers:     'open',
    expressions: { sad: 0.45, happy: 0.3 },
  };
}

// ── 23. Blowing a Kiss Goodbye ────────────────────────────────────────────────
export function getKissGoodbyePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return getKissGreetingPose(t, actTime, baseIdle);
}
