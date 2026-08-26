import { MathUtils } from 'three';
import type { VRMPose } from './types';

// ── 24. Single Flying Kiss ────────────────────────────────────────────────────
export function getKissSinglePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const phase = (actTime % 3.6) / 3.6;
  if (phase < 0.42) {
    // 2 fingers to lips
    return {
      ...baseIdle,
      headRot: [-0.04, 0.04, 0.06],
      leftUpperArmRot:  [0.08, -0.04, -1.28],
      leftLowerArmRot:  [0, -0.22, 0],
      rightUpperArmRot: [0.62, -0.10, 0.42],
      rightLowerArmRot: [0, 2.05, 0.18],
      rightHandRot:     [0.20, 0, 0.08],
      rightFingers:     'peace',
      expressions: { happy: 0.85 },
    };
  } else {
    // Toss forward
    const release = MathUtils.smoothstep((phase - 0.42) / 0.58, 0, 1);
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

// ── 25. Two-Handed Flying Kiss ────────────────────────────────────────────────
export function getKissTwoHandedPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const phase = (actTime % 4.0) / 4.0;
  if (phase < 0.45) {
    // Both palms to lips
    return {
      ...baseIdle,
      spineRot: [0.03, 0, 0],
      headRot: [-0.04, 0, 0],
      leftUpperArmRot:  [0.62, 0.10, -0.42],
      leftLowerArmRot:  [0, -2.05, -0.18],
      leftHandRot:      [0.20, 0, -0.08],
      leftFingers:      'open',
      rightUpperArmRot: [0.62, -0.10, 0.42],
      rightLowerArmRot: [0, 2.05, 0.18],
      rightHandRot:     [0.20, 0, 0.08],
      rightFingers:     'open',
      expressions: { happy: 0.85 },
    };
  } else {
    // Blow palms outward forward
    const release = MathUtils.smoothstep((phase - 0.45) / 0.55, 0, 1);
    return {
      ...baseIdle,
      headRot: [-0.06, 0, 0],
      leftUpperArmRot:  [MathUtils.lerp(0.62, 0.42, release), 0, MathUtils.lerp(-0.42, -0.85, release)],
      leftLowerArmRot:  [0, MathUtils.lerp(-2.05, -0.65, release), 0],
      leftHandRot:      [0.10, 0, 0],
      leftFingers:      'open',
      rightUpperArmRot: [MathUtils.lerp(0.62, 0.42, release), 0, MathUtils.lerp(0.42, 0.85, release)],
      rightLowerArmRot: [0, MathUtils.lerp(2.05, 0.65, release), 0],
      rightHandRot:     [0.10, 0, 0],
      rightFingers:     'open',
      expressions: { happy: 1.0 },
    };
  }
}

// ── 26. Finger Heart (🫰 Korean Crossed Finger Heart) ─────────────────────────
export function getFingerHeartPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const sway = Math.sin(actTime * 3.0) * 0.025;
  return {
    ...baseIdle,
    hipsRot: [0, 0.03, sway],
    spineRot: [0.02, -0.02, -sway],
    headRot: [-0.04, 0.05, 0.10],

    // Right arm raised cleanly to chest level showing finger heart
    rightUpperArmRot: [0.45, -0.10, 0.65],
    rightLowerArmRot: [0, 1.75, 0.15],
    rightHandRot:     [0.15, 0, 0.10],
    rightFingers:     'finger_heart',

    // Left hand rests comfortably at side
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    leftFingers:      'relaxed',

    expressions: { happy: 0.95, relaxed: 0.3 },
  };
}

// ── 27. Hand Heart (Small 💖 Over Chest) ───────────────────────────────────────
export function getHeartPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const rock = Math.sin(actTime * 3.0) * 0.025;

  return {
    ...baseIdle,
    hipsRot: [0, 0, rock],
    spineRot: [0.03, 0, -rock * 0.7],
    headRot: [-0.04, rock * 0.4, -0.10 + Math.sin(t * 2.0) * 0.02],

    // Both hands meet in front of chest facing camera to form a heart
    leftUpperArmRot:  [0.48, 0.18, -0.78],
    leftLowerArmRot:  [0, -1.65, -0.35],
    leftHandRot:      [0.10, 0.15, -0.15],
    leftFingers:      'heart',

    rightUpperArmRot: [0.48, -0.18, 0.78],
    rightLowerArmRot: [0, 1.65, 0.35],
    rightHandRot:     [0.10, -0.15, 0.15],
    rightFingers:     'heart',

    expressions: { happy: 1.0, relaxed: 0.4 },
  };
}

// ── 28. Arm Heart (Big 🙆 Over Head) ──────────────────────────────────────────
export function getArmHeartBigPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const sway = Math.sin(actTime * 3.2) * 0.03;
  return {
    ...baseIdle,
    hipsRot: [0, 0, sway],
    spineRot: [-0.03, 0, -sway * 0.5],
    headRot: [-0.05, 0, sway * 0.3],

    leftShoulderRot:  [0, 0, 0.15],
    rightShoulderRot: [0, 0, -0.15],
    leftUpperArmRot:  [0.15, 0, 2.05],
    leftLowerArmRot:  [0, -0.95, 0.45],
    leftHandRot:      [0, 0, -0.35],
    leftFingers:      'arm_heart',

    rightUpperArmRot: [0.15, 0, -2.05],
    rightLowerArmRot: [0, 0.95, -0.45],
    rightHandRot:     [0, 0, 0.35],
    rightFingers:     'arm_heart',

    expressions: { happy: 1.0 },
  };
}

// ── 29. Air Cuddles ───────────────────────────────────────────────────────────
export function getAirCuddlesPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const squeeze = Math.sin(actTime * 2.5) * 0.03;
  return {
    ...baseIdle,
    spineRot: [0.05, 0, 0],
    headRot: [0.08, -0.05, -0.10],
    leftUpperArmRot:  [0.48, 0.12, -0.85 + squeeze],
    leftLowerArmRot:  [0, -1.75, -0.18],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.52, -0.12, 0.85 - squeeze],
    rightLowerArmRot: [0, 1.75, 0.18],
    rightFingers:     'relaxed',
    expressions: { happy: 0.85, relaxed: 0.6 },
  };
}

// ── 30. Shy Blush ─────────────────────────────────────────────────────────────
export function getBlushPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const shySway = Math.sin(t * 1.8) * 0.025;
  return {
    ...baseIdle,
    hipsRot: [0, 0.10, shySway],
    spineRot: [0.04, -0.06, -shySway],
    headRot: [0.15, -0.08, -0.10],
    leftUpperArmRot:  [0.38, 0.12, -0.75],
    leftLowerArmRot:  [0, -1.65, -0.12],
    leftHandRot:      [0.12, 0, -0.15],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.38, -0.12, 0.75],
    rightLowerArmRot: [0, 1.65, 0.12],
    rightHandRot:     [0.12, 0, 0.15],
    rightFingers:     'relaxed',
    expressions: { relaxed: 0.7, happy: 0.45 },
  };
}

// ── 31. Eye Wink & Smile ──────────────────────────────────────────────────────
export function getWinkSmilePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.04, 0.05, 0.12],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.35, 0, 0.65],
    rightLowerArmRot: [0, 1.45, -0.25],
    rightFingers:     'peace',
    expressions: { happy: 1.0 },
  };
}

// ── 32. Seductive Hair Flip ───────────────────────────────────────────────────
export function getHairFlipPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = (actTime % 4.0) / 4.0;
  const brush = Math.sin(p * Math.PI);
  return {
    ...baseIdle,
    hipsRot: [0, -0.08, 0.02],
    spineRot: [0.02, 0.05, -0.02],
    headRot: [-0.04, -0.10 + brush * 0.08, 0.12],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.62, -0.15, 0.42],
    rightLowerArmRot: [0, 2.05, 0.18 + brush * 0.15],
    rightHandRot:     [0.18, 0, 0.08],
    rightFingers:     'open',
    expressions: { happy: 0.85, relaxed: 0.4 },
  };
}

// ── 33. Leaning In ────────────────────────────────────────────────────────────
export function getLeanInPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.14, 0, 0],
    chestRot: [0.06, 0, 0],
    headRot: [-0.10, 0, 0.06],
    leftUpperArmRot:  [0.15, 0, -1.20],
    leftLowerArmRot:  [0, -0.65, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.15, 0, 1.20],
    rightLowerArmRot: [0, 0.65, 0],
    rightFingers:     'relaxed',
    expressions: { happy: 0.65, relaxed: 0.5 },
  };
}

// ── 34. Gazing Lovingly ───────────────────────────────────────────────────────
export function getLovingGazePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const sway = Math.sin(t * 1.2) * 0.025;
  return {
    ...baseIdle,
    hipsRot: [0, 0, sway],
    spineRot: [0.02, 0, -sway * 0.6],
    headRot: [-0.02, sway * 0.25, 0.10],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    expressions: { happy: 0.85, relaxed: 0.75 },
  };
}

// ── 35. Lip Bite ──────────────────────────────────────────────────────────────
export function getLipBitePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.02, 0.03, 0.12],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.38, 0, 0.85],
    rightLowerArmRot: [0, 1.65, -0.12],
    rightFingers:     'relaxed',
    expressions: { happy: 0.8, surprised: 0.2 },
  };
}

// ── 36. Beckoning ─────────────────────────────────────────────────────────────
export function getBeckonPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const curlLoop = Math.sin(actTime * 7.0) * 0.18;
  return {
    ...baseIdle,
    headRot: [-0.03, 0.05, 0.08],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.38, 0, 0.85],
    rightLowerArmRot: [0, 1.45, -0.12 + curlLoop],
    rightHandRot:     [0.18, 0, curlLoop * 0.35],
    rightFingers:     'pointing',
    expressions: { happy: 0.9 },
  };
}

// ── 37. Tracing a Heart ───────────────────────────────────────────────────────
export function getTraceHeartPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const heartT = (actTime * 3.0) % (Math.PI * 2);
  const hx = Math.sin(heartT) * 0.15;
  const hy = -Math.cos(heartT) * 0.10;
  return {
    ...baseIdle,
    headRot: [-0.04 + hy * 0.12, hx * 0.20, 0.05],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.48 + hy * 0.20, 0, 0.75 + hx * 0.30],
    rightLowerArmRot: [0, 1.35, 0],
    rightHandRot:     [0.12, 0, 0],
    rightFingers:     'pointing',
    expressions: { happy: 0.9 },
  };
}

// ── 38. Peeking Through Fingers ───────────────────────────────────────────────
export function getPeekFingersPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const peek = Math.sin(actTime * 3.5) * 0.06;
  return {
    ...baseIdle,
    headRot: [0.02, 0, 0],
    leftUpperArmRot:  [0.62, 0.10, -0.42],
    leftLowerArmRot:  [0, -2.05 - peek, -0.18],
    leftHandRot:      [0.18, 0, -0.12],
    leftFingers:      'open',
    rightUpperArmRot: [0.62, -0.10, 0.42],
    rightLowerArmRot: [0, 2.05 + peek, 0.18],
    rightHandRot:     [0.18, 0, 0.12],
    rightFingers:     'open',
    expressions: { happy: 0.9, surprised: 0.3 },
  };
}

// ── 39. Twirling Hair ─────────────────────────────────────────────────────────
export function getTwirlHairPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const twirl = Math.sin(actTime * 6.0) * 0.10;
  return {
    ...baseIdle,
    headRot: [-0.02, -0.04, 0.10],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.62, -0.15, 0.42],
    rightLowerArmRot: [0, 2.05, 0.18],
    rightHandRot:     [0.18, 0, twirl],
    rightFingers:     'pinch',
    expressions: { happy: 0.85, relaxed: 0.4 },
  };
}

// ── 40. Deep Loving Sigh ──────────────────────────────────────────────────────
export function getLovingSighPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const p = (actTime % 4.5) / 4.5;
  const breath = Math.sin(p * Math.PI);
  return {
    ...baseIdle,
    spineRot: [-0.04 * breath, 0, 0],
    chestRot: [0.06 * breath, 0, 0],
    headRot: [-0.10 * breath, 0, 0.08],
    leftShoulderRot:  [0, 0, 0.04 * breath],
    rightShoulderRot: [0, 0, -0.04 * breath],
    leftUpperArmRot:  [0.08, -0.04, -1.28],
    leftLowerArmRot:  [0, -0.22, 0],
    rightUpperArmRot: [0.08, 0.04, 1.28],
    rightLowerArmRot: [0, 0.22, 0],
    expressions: { happy: 0.85, relaxed: 0.85 },
  };
}
