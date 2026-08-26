import { MathUtils } from 'three';
import type { VRMPose } from './types';

// ── 105. Yawning ──────────────────────────────────────────────────────────────
export function getRoutineYawnPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = (actTime % 5.0) / 5.0;
  const stretch = Math.sin(p * Math.PI);
  return {
    ...baseIdle,
    spineRot: [-0.06 * stretch, 0, 0],
    headRot: [-0.12 * stretch, 0, 0],
    leftShoulderRot:  [0, 0, 0.12 * stretch],
    leftUpperArmRot:  [0.20 * stretch, 0, MathUtils.lerp(-1.28, 1.95, stretch)],
    leftLowerArmRot:  [0, -0.35 * stretch, 0],
    leftFingers:      'open',
    rightUpperArmRot: [0.62 * stretch, -0.10, MathUtils.lerp(1.28, 0.42, stretch)],
    rightLowerArmRot: [0, 2.05 * stretch, 0.18],
    rightHandRot:     [0.20 * stretch, 0, 0],
    rightFingers:     'cup',
    expressions: { relaxed: 0.9, surprised: 0.3 },
  };
}

// ── 106. Falling Asleep Standing/Sitting ───────────────────────────────────────
export function getRoutineFallAsleepPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const cycle = actTime % 4.5;
  const drop = cycle < 3.2 ? MathUtils.smoothstep(cycle / 3.2, 0, 1) * 0.28 : Math.max(0, 1 - (cycle - 3.2) / 0.5) * 0.28;
  return {
    ...baseIdle,
    headRot: [drop, 0, drop * 0.20],
    spineRot: [drop * 0.30, 0, 0],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    expressions: cycle < 3.2 ? { relaxed: 0.9 } : { surprised: 0.9, happy: 0.2 },
  };
}

// ── 107. Sleeping ─────────────────────────────────────────────────────────────
export function getRoutineSleepingPose(t: number, baseIdle: VRMPose): VRMPose {
  const breath = Math.sin(t * 1.0) * 0.015;
  return {
    ...baseIdle,
    spineRot: [0.04 + breath, 0, 0],
    chestRot: [0.03 + breath * 1.5, 0, 0],
    headRot: [0.08, 0, 0.06],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    rightFingers:     'relaxed',
    expressions: { relaxed: 1.0 },
  };
}

// ── 108. Holding Phone ────────────────────────────────────────────────────────
export function getRoutinePhonePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const scroll = Math.sin(actTime * 6.0) * 0.05;
  return {
    ...baseIdle,
    headRot: [0.15, 0.03, 0],
    leftUpperArmRot:  [0.48, 0.12, -0.85],
    leftLowerArmRot:  [0, -1.65, -0.18],
    leftHandRot:      [0.12, 0, -0.08],
    leftFingers:      'phone',
    rightUpperArmRot: [0.48, -0.12, 0.85],
    rightLowerArmRot: [0, 1.65 + scroll, 0.18],
    rightHandRot:     [0.12, 0, 0.08],
    rightFingers:     'pointing',
    expressions: { happy: 0.7, neutral: 0.3 },
  };
}

// ── 109. Taking a Selfie ──────────────────────────────────────────────────────
export function getRoutineSelfiePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.04, 0.08, 0.14],
    leftUpperArmRot:  [0.35, 0, -0.65],
    leftLowerArmRot:  [0, -1.45, -0.25],
    leftHandRot:      [0.12, 0, -0.12],
    leftFingers:      'peace',
    rightUpperArmRot: [0.48, 0, 0.65],
    rightLowerArmRot: [0, 0.65, 0],
    rightHandRot:     [0.12, 0, 0],
    rightFingers:     'phone',
    expressions: { happy: 1.0 },
  };
}

// ── 110. Listening to Music ───────────────────────────────────────────────────
export function getRoutineListenMusicPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const beat = Math.sin(t * 7.0);
  const headBob = Math.max(0, beat) * 0.10;
  return {
    ...baseIdle,
    hipsRot: [0, Math.sin(t * 3.5) * 0.05, 0],
    headRot: [headBob - 0.03, 0, Math.sin(t * 3.5) * 0.05],
    leftUpperArmRot:  [0.62, 0.15, -0.42],
    leftLowerArmRot:  [0, -2.10, -0.20],
    leftHandRot:      [0.20, 0, 0],
    leftFingers:      'cup',
    rightUpperArmRot: [0.62, -0.15, 0.42],
    rightLowerArmRot: [0, 2.10, 0.20],
    rightHandRot:     [0.20, 0, 0],
    rightFingers:     'cup',
    expressions: { happy: 0.9, relaxed: 0.5 },
  };
}

// ── 111. Drinking Coffee/Tea ──────────────────────────────────────────────────
export function getRoutineCoffeePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const phase = (actTime % 4.8) / 4.8;
  if (phase < 0.45) {
    // Blow on cup
    return {
      ...baseIdle,
      headRot: [0.06, 0, 0],
      leftUpperArmRot:  [0.48, 0.12, -0.85],
      leftLowerArmRot:  [0, -1.65, -0.18],
      leftFingers:      'cup',
      rightUpperArmRot: [0.48, -0.12, 0.85],
      rightLowerArmRot: [0, 1.65, 0.18],
      rightFingers:     'cup',
      expressions: { neutral: 0.8 },
    };
  } else {
    // Sip and sigh "Ah"
    return {
      ...baseIdle,
      headRot: [-0.05, 0, 0.05],
      leftUpperArmRot:  [0.55, 0.10, -0.42],
      leftLowerArmRot:  [0, -2.05, -0.18],
      leftFingers:      'cup',
      rightUpperArmRot: [0.55, -0.10, 0.42],
      rightLowerArmRot: [0, 2.05, 0.18],
      rightFingers:     'cup',
      expressions: { relaxed: 0.95, happy: 0.6 },
    };
  }
}

// ── 112. Reading a Book ───────────────────────────────────────────────────────
export function getRoutineBookPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const pageTurn = Math.sin(actTime * 2.0) * 0.05;
  return {
    ...baseIdle,
    headRot: [0.18, 0, 0],
    leftUpperArmRot:  [0.48, 0.12, -0.85],
    leftLowerArmRot:  [0, -1.65, -0.18],
    leftHandRot:      [0.12, 0, -0.08],
    leftFingers:      'book',
    rightUpperArmRot: [0.48, -0.12, 0.85],
    rightLowerArmRot: [0, 1.65 + pageTurn, 0.18],
    rightHandRot:     [0.12, 0, 0.08],
    rightFingers:     'book',
    expressions: { neutral: 0.9 },
  };
}

// ── 113. Adjusting Glasses/Hair ───────────────────────────────────────────────
export function getRoutineAdjustGlassesPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.03, 0.03, 0.05],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.62, -0.10, 0.42],
    rightLowerArmRot: [0, 2.10, 0.18],
    rightHandRot:     [0.20, 0, 0],
    rightFingers:     'pointing',
    expressions: { happy: 0.6, neutral: 0.4 },
  };
}

// ── 114. Checking Watch ───────────────────────────────────────────────────────
export function getRoutineCheckWatchPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [0.12, -0.10, 0],
    leftUpperArmRot:  [0.48, 0.15, -0.85],
    leftLowerArmRot:  [0, -1.82, -0.20],
    leftHandRot:      [0.15, 0, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    rightFingers:     'relaxed',
    expressions: { neutral: 0.8 },
  };
}

// ── 115. Applying Makeup ──────────────────────────────────────────────────────
export function getRoutineMakeupPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const stroke = Math.sin(actTime * 5.0) * 0.03;
  return {
    ...baseIdle,
    headRot: [-0.03, 0.03, 0.05],
    leftUpperArmRot:  [0.48, 0.12, -0.85],
    leftLowerArmRot:  [0, -1.65, -0.18],
    leftHandRot:      [0.12, 0, 0],
    leftFingers:      'cup',
    rightUpperArmRot: [0.62, -0.10, 0.42],
    rightLowerArmRot: [0, 2.10 + stroke, 0.18],
    rightHandRot:     [0.20, 0, 0],
    rightFingers:     'pinch',
    expressions: { happy: 0.7, relaxed: 0.5 },
  };
}

// ── 116. Petting an Animal ────────────────────────────────────────────────────
export function getRoutinePetAnimalPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const stroke = Math.sin(actTime * 3.5) * 0.10;
  return {
    ...baseIdle,
    hipsPos: [0, -0.30, 0],
    spineRot: [0.22, 0, 0],
    headRot: [0.15, 0, 0],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.48, 0, 0.85],
    rightLowerArmRot: [0, 0.95 + stroke, 0],
    rightHandRot:     [0.12, 0, 0],
    rightFingers:     'open',
    leftUpperLegRot:  [-0.70, 0.06, 0],
    rightUpperLegRot: [-0.70, -0.06, 0],
    leftLowerLegRot:  [1.10, 0, 0],
    rightLowerLegRot: [1.10, 0, 0],
    expressions: { happy: 0.95, relaxed: 0.7 },
  };
}

// ── 117. Exercising/Yoga ──────────────────────────────────────────────────────
export function getRoutineExercisePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const balance = Math.sin(t * 1.5) * 0.02;
  return {
    ...baseIdle,
    spineRot: [-0.04, 0, 0],
    headRot: [-0.05, 0, 0],
    leftShoulderRot:  [0, 0, 0.15],
    rightShoulderRot: [0, 0, -0.15],
    leftUpperArmRot:  [0.15, 0, 2.05],
    leftLowerArmRot:  [0, -0.95, 0.45],
    leftHandRot:      [0, 0, -0.18],
    leftFingers:      'open',
    rightUpperArmRot: [0.15, 0, -2.05],
    rightLowerArmRot: [0, 0.95, -0.45],
    rightHandRot:     [0, 0, 0.18],
    rightFingers:     'open',
    leftUpperLegRot:  [-0.02, 0, 0],
    rightUpperLegRot: [-0.70, -0.45, 0.45 + balance],
    rightLowerLegRot: [1.60, 0, 0],
    expressions: { relaxed: 0.8 },
  };
}

// ── 118. Eating a Snack ───────────────────────────────────────────────────────
export function getRoutineSnackPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const chew = Math.sin(t * 8.0) * 0.025;
  return {
    ...baseIdle,
    headRot: [-0.03 + chew, 0, 0.05],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.62, -0.10, 0.42],
    rightLowerArmRot: [0, 2.05, 0.18],
    rightHandRot:     [0.20, 0, 0],
    rightFingers:     'pinch',
    expressions: { happy: 1.0, relaxed: 0.5 },
  };
}

// ── 119. Cooking/Stirring ─────────────────────────────────────────────────────
export function getRoutineCookingPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const stir = (actTime * 5.0) % (Math.PI * 2);
  const sx = Math.sin(stir) * 0.08;
  const sy = Math.cos(stir) * 0.08;
  return {
    ...baseIdle,
    headRot: [0.10, 0, 0],
    leftUpperArmRot:  [0.48, 0.12, -0.85],
    leftLowerArmRot:  [0, -1.65, -0.18],
    leftFingers:      'cup',
    rightUpperArmRot: [0.48 + sy, 0, 0.85 + sx],
    rightLowerArmRot: [0, 1.35, 0],
    rightHandRot:     [0.12, 0, 0],
    rightFingers:     'fist',
    expressions: { happy: 0.8 },
  };
}

// ── 120. Writing/Typing ───────────────────────────────────────────────────────
export function getRoutineTypingPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const typeL = Math.sin(t * 14.0) * 0.025;
  const typeR = Math.cos(t * 14.0) * 0.025;
  return {
    ...baseIdle,
    headRot: [0.12, 0, 0],
    spineRot: [0.05, 0, 0],
    leftUpperArmRot:  [0.38, 0, -1.05],
    leftLowerArmRot:  [0, -1.45 + typeL, -0.12],
    leftHandRot:      [0.12, 0, -0.08],
    leftFingers:      'writing',
    rightUpperArmRot: [0.38, 0, 1.05],
    rightLowerArmRot: [0, 1.45 - typeR, 0.12],
    rightHandRot:     [0.12, 0, 0.08],
    rightFingers:     'writing',
    expressions: { neutral: 0.9 },
  };
}

// ── 121. Putting on a Jacket ──────────────────────────────────────────────────
export function getRoutineJacketPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = (actTime % 4.5) / 4.5;
  const slip = Math.sin(p * Math.PI);
  return {
    ...baseIdle,
    spineRot: [0, slip * 0.06, 0],
    headRot: [-0.03, -slip * 0.10, 0],
    leftUpperArmRot:  [-0.12 * slip, 0, MathUtils.lerp(-1.28, 1.85, slip)],
    leftLowerArmRot:  [0, -0.45 * slip, 0],
    leftFingers:      'fist',
    rightUpperArmRot: [-0.12 * slip, 0, MathUtils.lerp(1.28, -1.85, slip)],
    rightLowerArmRot: [0, 0.45 * slip, 0],
    rightFingers:     'fist',
    expressions: { happy: 0.7, relaxed: 0.5 },
  };
}

// ── 122. Smelling Flowers ─────────────────────────────────────────────────────
export function getRoutineSmellFlowersPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = (actTime % 4.0) / 4.0;
  const inhale = Math.sin(p * Math.PI);
  return {
    ...baseIdle,
    spineRot: [-0.03 * inhale, 0, 0],
    headRot: [0.05 - 0.07 * inhale, 0, 0.05],
    leftUpperArmRot:  [0.48, 0.12, -0.85],
    leftLowerArmRot:  [0, -1.65, -0.18],
    leftFingers:      'cup',
    rightUpperArmRot: [0.48, -0.12, 0.85],
    rightLowerArmRot: [0, 1.65, 0.18],
    rightFingers:     'cup',
    expressions: { happy: 0.95, relaxed: 0.9 },
  };
}

// ── 123. Catching a Bug ───────────────────────────────────────────────────────
export function getRoutineCatchBugPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const phase = (actTime % 4.0) / 4.0;
  if (phase < 0.45) {
    // Slap hands together to catch
    return {
      ...baseIdle,
      headRot: [0.05, 0, 0],
      leftUpperArmRot:  [0.42, 0.12, -0.82],
      leftLowerArmRot:  [0, -1.65, -0.18],
      leftFingers:      'cup',
      rightUpperArmRot: [0.42, -0.12, 0.82],
      rightLowerArmRot: [0, 1.65, 0.18],
      rightFingers:     'cup',
      expressions: { surprised: 0.9 },
    };
  } else {
    // Peek inside cupped hands
    return {
      ...baseIdle,
      headRot: [0.15, 0, 0],
      leftUpperArmRot:  [0.42, 0.12, -0.82],
      leftLowerArmRot:  [0, -1.65, -0.18],
      leftFingers:      'cup',
      rightUpperArmRot: [0.42, -0.12, 0.82],
      rightLowerArmRot: [0, 1.65, 0.18],
      rightFingers:     'cup',
      expressions: { happy: 0.9, surprised: 0.5 },
    };
  }
}

// ── 124. Tying Shoes ──────────────────────────────────────────────────────────
export function getRoutineTieShoesPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = Math.sin(Math.min(actTime / 4.5, 1) * Math.PI);
  return {
    ...baseIdle,
    hipsPos: [0, -0.40 * p, 0],
    spineRot: [0.38 * p, 0, 0],
    headRot: [0.25 * p, 0, 0],
    leftUpperArmRot:  [0.30 * p, 0, MathUtils.lerp(-1.28, -0.85, p)],
    leftLowerArmRot:  [0, -1.15 * p, 0],
    leftFingers:      'pinch',
    rightUpperArmRot: [0.30 * p, 0, MathUtils.lerp(1.28, 0.85, p)],
    rightLowerArmRot: [0, 1.15 * p, 0],
    rightFingers:     'pinch',
    leftUpperLegRot:  [-0.50 * p, 0, 0],
    rightUpperLegRot: [-0.50 * p, 0, 0],
    leftLowerLegRot:  [0.70 * p, 0, 0],
    rightLowerLegRot: [0.70 * p, 0, 0],
    expressions: { neutral: 0.8 },
  };
}

// ── 125. Looking at the Sky ───────────────────────────────────────────────────
export function getRoutineLookSkyPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [-0.08, 0, 0],
    headRot: [-0.25, 0.03, 0.05],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.65, -0.12, 0.40],
    rightLowerArmRot: [0, 2.15, 0.20],
    rightHandRot:     [0.20, 0, 0],
    rightFingers:     'shield_eyes',
    expressions: { relaxed: 0.85, happy: 0.5 },
  };
}
