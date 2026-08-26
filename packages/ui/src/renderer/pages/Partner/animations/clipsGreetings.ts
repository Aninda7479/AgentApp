import { MathUtils } from 'three';
import type { VRMPose } from './types';

// ── 13. Standard Wave ─────────────────────────────────────────────────────────
export function getWavePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const waveCycle = Math.sin(actTime * 7.5);
  const bodyTurn = Math.sin(actTime * 1.8) * 0.04;

  return {
    ...baseIdle,
    hipsRot: [0, 0.05 + bodyTurn, 0.02],
    spineRot: [0.02, -0.03, -0.02],
    headRot: [
      (baseIdle.headRot?.[0] || 0) - 0.04,
      (baseIdle.headRot?.[1] || 0) + 0.05,
      0.08,
    ],
    leftUpperArmRot: [0.08, -0.04, -1.28],
    leftLowerArmRot: [0, -0.22, 0],
    leftHandRot:     [0.04, -0.04, -0.02],
    leftFingers:     'relaxed',
    rightUpperArmRot: [0.42, -0.15, 0.55],
    rightLowerArmRot: [0, 1.45, -0.15 + waveCycle * 0.20],
    rightHandRot:     [0.05, 0, waveCycle * 0.28],
    rightFingers:     'open',
    expressions: { happy: 0.95 },
  };
}

// ── 14. Energetic Wave ────────────────────────────────────────────────────────
export function getWaveEnergeticPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const hop = Math.abs(Math.sin(actTime * 8.5)) * 0.035;
  const waveL = Math.sin(actTime * 9.0) * 0.25;
  const waveR = Math.sin(actTime * 9.0 + Math.PI * 0.5) * 0.25;

  return {
    ...baseIdle,
    hipsPos: [0, hop, 0],
    spineRot: [-0.03, 0, 0],
    headRot: [-0.06, 0, 0],
    leftShoulderRot:  [0, 0, 0.15],
    rightShoulderRot: [0, 0, -0.15],
    leftUpperArmRot:  [0.20, 0, 1.85],
    leftLowerArmRot:  [0, -0.65 - waveL, 0],
    leftHandRot:      [0, 0, waveL * 0.30],
    leftFingers:      'open',
    rightUpperArmRot: [0.20, 0, -1.85],
    rightLowerArmRot: [0, 0.65 + waveR, 0],
    rightHandRot:     [0, 0, -waveR * 0.30],
    rightFingers:     'open',
    expressions: { happy: 1.0, surprised: 0.2 },
  };
}

// ── 15. Shy Wave ──────────────────────────────────────────────────────────────
export function getWaveShyPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const miniWave = Math.sin(actTime * 6.0) * 0.18;
  return {
    ...baseIdle,
    headRot: [0.10, -0.06, 0.08],
    spineRot: [0.02, -0.03, 0],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.42, -0.10, 0.75],
    rightLowerArmRot: [0, 1.65, -0.10 + miniWave * 0.15],
    rightHandRot:     [0.10, 0, miniWave * 0.25],
    rightFingers:     'open',
    expressions: { relaxed: 0.6, happy: 0.5 },
  };
}

// ── 16. Formal Bow ────────────────────────────────────────────────────────────
export function getBowPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const bowProg = Math.sin(Math.min(actTime / 3.2, 1) * Math.PI);
  const bend = MathUtils.clamp(bowProg * 0.48, 0, 0.48);

  return {
    ...baseIdle,
    hipsRot: [bend * 0.35, 0, 0],
    spineRot: [bend, 0, 0],
    headRot:  [bend * 0.3, 0, 0],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    leftFingers:      'salute',
    rightFingers:     'salute',
    expressions: { neutral: 1.0 },
  };
}

// ── 17. Casual Nod ────────────────────────────────────────────────────────────
export function getNodCasualPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const nod = Math.sin(actTime * 6.0) * 0.14;
  return {
    ...baseIdle,
    headRot: [nod, 0.04, 0.05],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.22, 0, 1.10],
    rightLowerArmRot: [0, 0.65, 0],
    rightFingers:     'open',
    expressions: { happy: 0.75 },
  };
}

// ── 18. Air Hug Greeting ──────────────────────────────────────────────────────
export function getAirHugPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const pulse = Math.sin(actTime * 3.0) * 0.04;
  return {
    ...baseIdle,
    spineRot: [0.04, 0, 0],
    chestRot: [0.03, 0, 0],
    headRot: [-0.04, 0, 0.05],
    leftUpperArmRot:  [0.35, 0.10, -0.85 + pulse],
    leftLowerArmRot:  [0, -0.85, 0],
    leftHandRot:      [0.10, 0, -0.10],
    leftFingers:      'open',
    rightUpperArmRot: [0.35, -0.10, 0.85 - pulse],
    rightLowerArmRot: [0, 0.85, 0],
    rightHandRot:     [0.10, 0, 0.10],
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
      headRot: [-0.04, 0.03, 0.06],
      leftUpperArmRot:  [0.08, -0.04, -1.28],
      leftLowerArmRot:  [0, -0.22, 0],
      rightUpperArmRot: [0.62, -0.10, 0.42],
      rightLowerArmRot: [0, 2.05, 0.18],
      rightHandRot:     [0.20, 0, 0.08],
      rightFingers:     'relaxed',
      expressions: { happy: 0.85 },
    };
  } else {
    // Blow and open hand outward to viewer
    const release = MathUtils.smoothstep((phase - 0.45) / 0.55, 0, 1);
    return {
      ...baseIdle,
      headRot: [-0.05, 0.04, 0.08],
      leftUpperArmRot:  [0.08, -0.04, -1.28],
      leftLowerArmRot:  [0, -0.22, 0],
      rightUpperArmRot: [MathUtils.lerp(0.62, 0.42, release), 0, MathUtils.lerp(0.42, 0.85, release)],
      rightLowerArmRot: [0, MathUtils.lerp(2.05, 0.65, release), 0],
      rightHandRot:     [0.10, 0, 0],
      rightFingers:     'open',
      expressions: { happy: 1.0 },
    };
  }
}

// ── 20. Sleepy Good Morning ───────────────────────────────────────────────────
export function getGoodMorningPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const rub = Math.sin(actTime * 6.0) * 0.05;
  return {
    ...baseIdle,
    headRot: [0.05, 0, 0],
    leftUpperArmRot:  [0.48, 0.10, -0.75],
    leftLowerArmRot:  [0, -1.85 - rub, -0.15],
    leftFingers:      'fist',
    rightUpperArmRot: [0.48, -0.10, 0.75],
    rightLowerArmRot: [0, 1.85 + rub, 0.15],
    rightFingers:     'fist',
    expressions: { relaxed: 0.85, lookDown: 0.3 },
  };
}

// ── 21. Standard Goodbye Wave ─────────────────────────────────────────────────
export function getGoodbyeWavePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const slowWave = Math.sin(actTime * 4.5) * 0.25;
  return {
    ...baseIdle,
    headRot: [-0.03, 0.04, 0.06],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.42, -0.15, 0.55],
    rightLowerArmRot: [0, 1.45, -0.15 + slowWave * 0.18],
    rightHandRot:     [0.05, 0, slowWave * 0.30],
    rightFingers:     'open',
    expressions: { happy: 0.75, relaxed: 0.4 },
  };
}

// ── 22. Reluctant Goodbye ─────────────────────────────────────────────────────
export function getGoodbyeReluctantPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const wave = Math.sin(actTime * 4.0) * 0.18;
  return {
    ...baseIdle,
    hipsRot: [0, 0.30, 0],
    spineRot: [0.03, -0.20, 0],
    headRot: [-0.04, -0.25, -0.08],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.35, 0, 0.85],
    rightLowerArmRot: [0, 1.15, 0.10 + wave * 0.15],
    rightHandRot:     [0.10, 0, wave * 0.25],
    rightFingers:     'open',
    expressions: { sad: 0.45, happy: 0.3 },
  };
}

// ── 23. Blowing a Kiss Goodbye ────────────────────────────────────────────────
export function getKissGoodbyePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return getKissGreetingPose(t, actTime, baseIdle);
}
