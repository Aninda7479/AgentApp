import { MathUtils } from 'three';
import type { VRMPose } from './types';

// ── 24. Single Flying Kiss ────────────────────────────────────────────────────
export function getKissSinglePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const phase = (actTime % 3.6) / 3.6;
  if (phase < 0.42) {
    // 2 fingers to lips
    return {
      ...baseIdle,
      headRot: [-0.04, 0.05, 0.08],
      leftUpperArmRot:  [0.08, 0, -1.28],
      leftLowerArmRot:  [0, 0.22, 0],
      rightUpperArmRot: [0.65, -0.12, 0.45],
      rightLowerArmRot: [0, -2.1, -0.22],
      rightHandRot:     [0.25, 0, 0.1],
      rightFingers:     'peace',
      expressions: { happy: 0.85 },
    };
  } else {
    // Toss forward
    const release = MathUtils.smoothstep((phase - 0.42) / 0.58, 0, 1);
    return {
      ...baseIdle,
      headRot: [-0.06, 0.06, 0.1],
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

// ── 25. Two-Handed Flying Kiss ────────────────────────────────────────────────
export function getKissTwoHandedPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const phase = (actTime % 4.0) / 4.0;
  if (phase < 0.45) {
    // Both palms to lips
    return {
      ...baseIdle,
      spineRot: [0.03, 0, 0],
      headRot: [-0.05, 0, 0],
      leftUpperArmRot:  [0.65, 0.12, -0.45],
      leftLowerArmRot:  [0, 2.1, 0.22],
      leftHandRot:      [0.25, 0, -0.1],
      leftFingers:      'open',
      rightUpperArmRot: [0.65, -0.12, 0.45],
      rightLowerArmRot: [0, -2.1, -0.22],
      rightHandRot:     [0.25, 0, 0.1],
      rightFingers:     'open',
      expressions: { happy: 0.85 },
    };
  } else {
    // Blow palms outward forward
    const release = MathUtils.smoothstep((phase - 0.45) / 0.55, 0, 1);
    return {
      ...baseIdle,
      headRot: [-0.08, 0, 0],
      leftUpperArmRot:  [MathUtils.lerp(0.65, 0.45, release), 0, MathUtils.lerp(-0.45, -0.85, release)],
      leftLowerArmRot:  [0, MathUtils.lerp(2.1, 0.65, release), 0],
      leftHandRot:      [0.1, 0, 0],
      leftFingers:      'open',
      rightUpperArmRot: [MathUtils.lerp(0.65, 0.45, release), 0, MathUtils.lerp(0.45, 0.85, release)],
      rightLowerArmRot: [0, MathUtils.lerp(-2.1, -0.65, release), 0],
      rightHandRot:     [0.1, 0, 0],
      rightFingers:     'open',
      expressions: { happy: 1.0 },
    };
  }
}

// ── 26. Finger Heart (🫰 Korean Crossed Finger Heart) ─────────────────────────
export function getFingerHeartPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const sway = Math.sin(actTime * 3.0) * 0.03;
  return {
    ...baseIdle,
    hipsRot: [0, 0.04, sway],
    spineRot: [0.03, -0.03, -sway],
    headRot: [-0.05, 0.06, 0.12],

    // Right arm raised cleanly to chest level showing finger heart
    rightUpperArmRot: [0.52, -0.12, 0.72],
    rightLowerArmRot: [0, -1.82, -0.18],
    rightHandRot:     [0.18, 0, 0.12],
    rightFingers:     'finger_heart',

    // Left hand rests comfortably at side
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    leftFingers:      'relaxed',

    expressions: { happy: 0.95, relaxed: 0.3 },
  };
}

// ── 27. Hand Heart (Small 💖 Over Chest) ───────────────────────────────────────
export function getHeartPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const rock = Math.sin(actTime * 3.0) * 0.03;

  return {
    ...baseIdle,
    hipsRot: [0, 0, rock],
    spineRot: [0.04, 0, -rock * 0.8],
    headRot: [-0.04, rock * 0.5, -0.14 + Math.sin(t * 2.0) * 0.03],

    // Both hands cleanly meet in front of chest facing camera
    leftUpperArmRot:  [0.55, 0.22, -0.92],
    leftLowerArmRot:  [0, 1.55, 0.45],
    leftHandRot:      [0, 0.2, -0.22],
    leftFingers:      'heart',

    rightUpperArmRot: [0.55, -0.22, 0.92],
    rightLowerArmRot: [0, -1.55, -0.45],
    rightHandRot:     [0, -0.2, 0.22],
    rightFingers:     'heart',

    expressions: { happy: 1.0, relaxed: 0.4 },
  };
}

// ── 28. Arm Heart (Big 🙆 Over Head) ──────────────────────────────────────────
export function getArmHeartBigPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const sway = Math.sin(actTime * 3.2) * 0.04;
  return {
    ...baseIdle,
    hipsRot: [0, 0, sway],
    spineRot: [-0.04, 0, -sway * 0.6],
    headRot: [-0.06, 0, sway * 0.4],

    leftShoulderRot:  [0, 0, 0.15],
    rightShoulderRot: [0, 0, -0.15],
    leftUpperArmRot:  [0.2, 0, 2.05],
    leftLowerArmRot:  [0, 0.95, -0.45],
    leftHandRot:      [0, 0, -0.35],
    leftFingers:      'arm_heart',

    rightUpperArmRot: [0.2, 0, -2.05],
    rightLowerArmRot: [0, -0.95, 0.45],
    rightHandRot:     [0, 0, 0.35],
    rightFingers:     'arm_heart',

    expressions: { happy: 1.0 },
  };
}

// ── 29. Air Cuddles ───────────────────────────────────────────────────────────
export function getAirCuddlesPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const squeeze = Math.sin(actTime * 2.5) * 0.04;
  return {
    ...baseIdle,
    spineRot: [0.06, 0, 0],
    headRot: [0.1, -0.06, -0.12],
    leftUpperArmRot:  [0.55, 0.15, -1.02 + squeeze],
    leftLowerArmRot:  [0, 1.78, 0.22],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.58, -0.15, 1.02 - squeeze],
    rightLowerArmRot: [0, -1.78, -0.22],
    rightFingers:     'relaxed',
    expressions: { happy: 0.85, relaxed: 0.6 },
  };
}

// ── 30. Shy Blush ─────────────────────────────────────────────────────────────
export function getBlushPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const shySway = Math.sin(t * 1.8) * 0.03;
  return {
    ...baseIdle,
    hipsRot: [0, 0.12, shySway],
    spineRot: [0.05, -0.08, -shySway],
    headRot: [0.18, -0.1, -0.12],
    leftUpperArmRot:  [0.45, 0.15, -0.85],
    leftLowerArmRot:  [0, 1.65, 0.15],
    leftHandRot:      [0.15, 0, -0.2],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.45, -0.15, 0.85],
    rightLowerArmRot: [0, -1.65, -0.15],
    rightHandRot:     [0.15, 0, 0.2],
    rightFingers:     'relaxed',
    expressions: { relaxed: 0.7, happy: 0.45 },
  };
}

// ── 31. Eye Wink & Smile ──────────────────────────────────────────────────────
export function getWinkSmilePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.04, 0.06, 0.15],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.32, 0, 0.65],
    rightLowerArmRot: [0, -1.35, -0.45],
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
    hipsRot: [0, -0.1, 0.03],
    spineRot: [0.02, 0.06, -0.03],
    headRot: [-0.04, -0.12 + brush * 0.1, 0.15],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.65, -0.15, 0.45],
    rightLowerArmRot: [0, -2.1, -0.22 + brush * 0.2],
    rightHandRot:     [0.2, 0, 0.1],
    rightFingers:     'open',
    expressions: { happy: 0.85, relaxed: 0.4 },
  };
}

// ── 33. Leaning In ────────────────────────────────────────────────────────────
export function getLeanInPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.16, 0, 0],
    chestRot: [0.08, 0, 0],
    headRot: [-0.12, 0, 0.08],
    leftUpperArmRot:  [0.18, 0, -1.2],
    leftLowerArmRot:  [0, 0.65, 0],
    leftFingers:      'relaxed',
    rightUpperArmRot: [0.18, 0, 1.2],
    rightLowerArmRot: [0, -0.65, 0],
    rightFingers:     'relaxed',
    expressions: { happy: 0.65, relaxed: 0.5 },
  };
}

// ── 34. Gazing Lovingly ───────────────────────────────────────────────────────
export function getLovingGazePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const sway = Math.sin(t * 1.2) * 0.03;
  return {
    ...baseIdle,
    hipsRot: [0, 0, sway],
    spineRot: [0.03, 0, -sway * 0.7],
    headRot: [-0.02, sway * 0.3, 0.12],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.22, 0],
    expressions: { happy: 0.85, relaxed: 0.75 },
  };
}

// ── 35. Lip Bite ──────────────────────────────────────────────────────────────
export function getLipBitePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    headRot: [-0.02, 0.04, 0.14],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.45, 0, 0.85],
    rightLowerArmRot: [0, -1.65, -0.15],
    rightFingers:     'relaxed',
    expressions: { happy: 0.8, surprised: 0.2 },
  };
}

// ── 36. Beckoning ─────────────────────────────────────────────────────────────
export function getBeckonPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const curlLoop = Math.sin(actTime * 7.0) * 0.22;
  return {
    ...baseIdle,
    headRot: [-0.04, 0.06, 0.1],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.45, 0, 0.85],
    rightLowerArmRot: [0, -1.45, -0.15 + curlLoop],
    rightHandRot:     [0.2, 0, curlLoop * 0.4],
    rightFingers:     'pointing',
    expressions: { happy: 0.9 },
  };
}

// ── 37. Tracing a Heart ───────────────────────────────────────────────────────
export function getTraceHeartPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const heartT = (actTime * 3.0) % (Math.PI * 2);
  const hx = Math.sin(heartT) * 0.18;
  const hy = -Math.cos(heartT) * 0.12;
  return {
    ...baseIdle,
    headRot: [-0.05 + hy * 0.15, hx * 0.25, 0.06],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.55 + hy * 0.25, 0, 0.75 + hx * 0.35],
    rightLowerArmRot: [0, -1.35, 0],
    rightHandRot:     [0.15, 0, 0],
    rightFingers:     'pointing',
    expressions: { happy: 0.9 },
  };
}

// ── 38. Peeking Through Fingers ───────────────────────────────────────────────
export function getPeekFingersPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const peek = Math.sin(actTime * 3.5) * 0.08;
  return {
    ...baseIdle,
    headRot: [0.02, 0, 0],
    leftUpperArmRot:  [0.65, 0.12, -0.45],
    leftLowerArmRot:  [0, 2.1 + peek, 0.22],
    leftHandRot:      [0.2, 0, -0.15],
    leftFingers:      'open',
    rightUpperArmRot: [0.65, -0.12, 0.45],
    rightLowerArmRot: [0, -2.1 - peek, -0.22],
    rightHandRot:     [0.2, 0, 0.15],
    rightFingers:     'open',
    expressions: { happy: 0.9, surprised: 0.3 },
  };
}

// ── 39. Twirling Hair ─────────────────────────────────────────────────────────
export function getTwirlHairPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const twirl = Math.sin(actTime * 6.0) * 0.12;
  return {
    ...baseIdle,
    headRot: [-0.02, -0.05, 0.12],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.65, -0.15, 0.45],
    rightLowerArmRot: [0, -2.1, -0.22],
    rightHandRot:     [0.2, 0, twirl],
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
    spineRot: [-0.05 * breath, 0, 0],
    chestRot: [0.08 * breath, 0, 0],
    headRot: [-0.12 * breath, 0, 0.1],
    leftShoulderRot:  [0, 0, 0.05 * breath],
    rightShoulderRot: [0, 0, -0.05 * breath],
    leftUpperArmRot:  [0.08, 0, -1.28],
    leftLowerArmRot:  [0, 0.22, 0],
    rightUpperArmRot: [0.08, 0, 1.28],
    rightLowerArmRot: [0, -0.22, 0],
    expressions: { happy: 0.85, relaxed: 0.85 },
  };
}
