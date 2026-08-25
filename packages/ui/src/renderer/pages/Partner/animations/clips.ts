import { MathUtils } from 'three';
import type { VRMPose } from './types';

// ── Organic Lifelike Standing Idle ────────────────────────────────────────────
export function getIdlePose(t: number, gazeX: number, gazeY: number): VRMPose {
  // Breathing: 4.2s natural resting cycle
  const breath = Math.sin(t * 1.5);
  // Weight-shifting hip sway: 5.6s slow cycle
  const swaySide = Math.sin(t * 0.4);
  const swayRot = Math.cos(t * 0.4);

  return {
    // Subtle weight shift on hips
    hipsPos: [swaySide * 0.015, breath * 0.005, 0],
    hipsRot: [0, swayRot * 0.02, swaySide * 0.02],

    // Spine & chest counter-balance the hip sway
    spineRot: [0.02 + breath * 0.02, -swayRot * 0.015, -swaySide * 0.015],
    chestRot: [breath * 0.025, swaySide * 0.01, 0],
    upperChestRot: [breath * 0.015, 0, 0],

    // Neck & Head with organic micro-motion & eye tracking
    neckRot: [-0.01 + breath * 0.01, gazeX * 0.25, gazeY * 0.15],
    headRot: [
      -gazeY * 0.35 + Math.sin(t * 0.6) * 0.02,
      gazeX * 0.45 + swayRot * 0.02,
      -gazeX * 0.1 + Math.sin(t * 0.45) * 0.015,
    ],

    // Shoulders slightly rise on inhale
    leftShoulderRot: [0, 0, 0.02 + breath * 0.02],
    rightShoulderRot: [0, 0, -0.02 - breath * 0.02],

    // Left Arm (relaxed natural drop with subtle elbow curve)
    leftUpperArmRot: [0.1 + breath * 0.015, -0.05, -1.22 + swaySide * 0.025],
    leftLowerArmRot: [0.22, -0.12, -0.1],
    leftHandRot:     [0.08, -0.05, -0.05],
    leftFingers:     'relaxed',

    // Right Arm (relaxed natural drop with subtle elbow curve)
    rightUpperArmRot: [0.1 + breath * 0.015, 0.05, 1.22 - swaySide * 0.025],
    rightLowerArmRot: [0.22, 0.12, 0.1],
    rightHandRot:     [0.08, 0.05, 0.05],
    rightFingers:     'relaxed',

    // Legs with contrapposto balance
    leftUpperLegRot:  [-0.02, 0.02, -swaySide * 0.025],
    rightUpperLegRot: [-0.02, -0.02, -swaySide * 0.025],
    leftLowerLegRot:  [0.05, 0, 0],
    rightLowerLegRot: [0.05, 0, 0],
    leftFootRot:      [0, 0, swaySide * 0.02],
    rightFootRot:     [0, 0, swaySide * 0.02],
  };
}

// ── Wave (Hello 👋) ───────────────────────────────────────────────────────────
export function getWavePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const waveCycle = Math.sin(actTime * 8.0);
  const bodyTurn = Math.sin(actTime * 2.0) * 0.06;

  return {
    ...baseIdle,
    hipsRot: [0, 0.08 + bodyTurn, 0.02],
    spineRot: [0.02, -0.05, -0.02],
    headRot: [
      (baseIdle.headRot?.[0] || 0) - 0.05,
      (baseIdle.headRot?.[1] || 0) + 0.08,
      0.12,
    ],

    // Left hand rests comfortably on hip
    leftUpperArmRot: [0.15, -0.2, -0.75],
    leftLowerArmRot: [0.85, -0.2, -0.65],
    leftHandRot:     [0.2, 0, -0.2],
    leftFingers:     'relaxed',

    // Right arm raised and waving gracefully
    rightUpperArmRot: [0.25, -0.15, 0.45],
    rightLowerArmRot: [-0.15, 0.25, -1.6 + waveCycle * 0.28],
    rightHandRot:     [0.0, -1.4, waveCycle * 0.3],
    rightFingers:     'open',

    expressions: { happy: 0.95 },
  };
}

// ── Heart (💖 Cute Love) ──────────────────────────────────────────────────────
export function getHeartPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const rock = Math.sin(actTime * 3.0) * 0.04;

  return {
    ...baseIdle,
    hipsRot: [0, 0, rock],
    spineRot: [0.04, 0, -rock * 0.8],
    headRot: [-0.04, rock * 0.5, -0.16 + Math.sin(t * 2.0) * 0.04],

    // Both hands form a heart at chest level
    leftUpperArmRot:  [0.52, -0.3, -0.55],
    leftLowerArmRot:  [0.92, -0.1, -1.2],
    leftHandRot:      [0.1, 0, -0.25],
    leftFingers:      'heart',

    rightUpperArmRot: [0.52, 0.3, 0.55],
    rightLowerArmRot: [0.92, 0.1, 1.2],
    rightHandRot:     [0.1, 0, 0.25],
    rightFingers:     'heart',

    expressions: { happy: 1.0, relaxed: 0.4 },
  };
}

// ── Peace (✌️ Playful Victory) ─────────────────────────────────────────────────
export function getPeacePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const bounce = Math.sin(actTime * 4.0) * 0.02;

  return {
    ...baseIdle,
    hipsRot: [0, 0, 0.05 + bounce],
    headRot: [-0.05, 0.05, 0.16],

    // Left arm on waist
    leftUpperArmRot: [0.15, -0.15, -0.8],
    leftLowerArmRot: [0.85, -0.2, -0.6],
    leftFingers:     'relaxed',

    // Right arm holds peace sign near eye
    rightUpperArmRot: [0.28, 0.3, -0.5],
    rightLowerArmRot: [0.35, 0.05, -1.55],
    rightHandRot:     [0.35, -0.1, 0.25],
    rightFingers:     'peace',

    expressions: { happy: 0.95 },
  };
}

// ── Dance (Groovy Rhythm 💃) ─────────────────────────────────────────────────
export function getDancePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const beat = t * 4.4;
  const danceSway = Math.sin(beat);
  const danceStep = Math.cos(beat);
  const bounce = Math.abs(Math.sin(beat * 2.0));

  return {
    ...baseIdle,
    hipsPos: [danceSway * 0.07, bounce * 0.03, 0],
    hipsRot: [0, danceStep * 0.1, danceSway * 0.09],
    spineRot: [0.03, -danceStep * 0.06, -danceSway * 0.07],
    chestRot: [bounce * 0.03, danceStep * 0.04, 0],
    headRot: [
      bounce * 0.08,
      -danceSway * 0.22,
      danceSway * 0.12,
    ],

    // Flowing dance arms
    leftUpperArmRot:  [0.3 + danceSway * 0.25, -0.2, -0.6 + danceStep * 0.4],
    leftLowerArmRot:  [0.7 + bounce * 0.2, 0, -0.6],
    leftHandRot:      [danceSway * 0.2, 0, 0],
    leftFingers:      'open',

    rightUpperArmRot: [0.3 - danceSway * 0.25, 0.2, 0.6 - danceStep * 0.4],
    rightLowerArmRot: [0.7 + bounce * 0.2, 0, 0.6],
    rightHandRot:     [-danceSway * 0.2, 0, 0],
    rightFingers:     'open',

    leftUpperLegRot:  [-0.05 + danceStep * 0.05, 0, -danceSway * 0.05],
    rightUpperLegRot: [-0.05 - danceStep * 0.05, 0, -danceSway * 0.05],
    leftLowerLegRot:  [0.08 + Math.max(0, danceSway) * 0.1, 0, 0],
    rightLowerLegRot: [0.08 + Math.max(0, -danceSway) * 0.1, 0, 0],

    expressions: { happy: 0.95 },
  };
}

// ── Stretch (Morning Refresh 🤸) ──────────────────────────────────────────────
export function getStretchPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const stretchPhase = (actTime % 6.0) / 6.0;

  if (stretchPhase < 0.55) {
    const p = stretchPhase / 0.55;
    const raise = MathUtils.smoothstep(p, 0, 1);
    return {
      ...baseIdle,
      spineRot: [-0.18 * raise, 0, 0],
      chestRot: [0.1 * raise, 0, 0],
      headRot: [-0.32 * raise, 0, 0],
      leftUpperArmRot:  [0.35 * raise, 0, MathUtils.lerp(-1.22, 2.7, raise)],
      leftLowerArmRot:  [0.12, 0, 0],
      leftFingers:      'open',
      rightUpperArmRot: [0.35 * raise, 0, MathUtils.lerp(1.22, -2.7, raise)],
      rightLowerArmRot: [0.12, 0, 0],
      rightFingers:     'open',
      expressions: { relaxed: 0.8 },
    };
  } else {
    const p = (stretchPhase - 0.55) / 0.45;
    const release = MathUtils.smoothstep(p, 0, 1);
    return {
      ...baseIdle,
      spineRot: [MathUtils.lerp(-0.18, 0.02, release), 0, 0],
      headRot: [MathUtils.lerp(-0.32, 0, release), 0, 0],
      leftUpperArmRot:  [0.1, 0, MathUtils.lerp(2.7, -1.22, release)],
      leftLowerArmRot:  [0.2, -0.1, -0.1],
      leftFingers:      'relaxed',
      rightUpperArmRot: [0.1, 0, MathUtils.lerp(-2.7, 1.22, release)],
      rightLowerArmRot: [0.2, 0.1, 0.1],
      rightFingers:     'relaxed',
      expressions: { relaxed: 0.5 },
    };
  }
}

// ── Neko (Cat Girl Paws 🐱) ──────────────────────────────────────────────────
export function getNekoPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const pawL = Math.sin(t * 6.5) * 0.2;
  const pawR = Math.cos(t * 6.5) * 0.2;
  const headSway = Math.sin(t * 3.0) * 0.14;

  return {
    ...baseIdle,
    headRot: [0, Math.cos(t * 2.5) * 0.1, headSway],
    leftUpperArmRot:  [0.4, -0.25, -0.45],
    leftLowerArmRot:  [0.75, -0.2, -1.3 + pawL],
    leftHandRot:      [0.85, 0, 0],
    leftFingers:      'cat',

    rightUpperArmRot: [0.4, 0.25, 0.45],
    rightLowerArmRot: [0.75, 0.2, 1.3 + pawR],
    rightHandRot:     [0.85, 0, 0],
    rightFingers:     'cat',

    expressions: { happy: 0.95 },
  };
}

// ── Salute (🫡 Sharp & Respectful) ─────────────────────────────────────────────
export function getSalutePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.01, 0, 0],
    headRot: [0.02, 0.03, 0.02],
    rightUpperArmRot: [0.22, 0.35, -0.45],
    rightLowerArmRot: [0.48, 0.6, -1.75],
    rightHandRot:     [0.1, 0.3, -0.15],
    rightFingers:     'salute',
    leftFingers:      'relaxed',
    expressions: { neutral: 0.7, happy: 0.35 },
  };
}

// ── Bow (🙇 Polite Japanese Greeting) ─────────────────────────────────────────
export function getBowPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const bowProg = Math.sin((actTime / 3.2) * Math.PI);
  const bend = MathUtils.clamp(bowProg * 0.48, 0, 0.48);

  return {
    ...baseIdle,
    hipsRot: [bend * 0.3, 0, 0],
    spineRot: [bend, 0, 0],
    headRot:  [bend * 0.4, 0, 0],
    leftUpperArmRot:  [0.05, 0, -1.28],
    rightUpperArmRot: [0.05, 0, 1.28],
    leftFingers:      'salute',
    rightFingers:     'salute',
    expressions: { neutral: 1.0 },
  };
}

// ── Cheer (🎉 Excited Fist Pump) ──────────────────────────────────────────────
export function getCheerPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const hop = Math.abs(Math.sin(t * 7.5));

  return {
    ...baseIdle,
    hipsPos: [0, hop * 0.04, 0],
    spineRot: [-0.06, 0, 0],
    headRot: [-0.22, 0, 0],
    leftUpperArmRot:  [0.5, 0, 2.2],
    leftLowerArmRot:  [0.7 + hop * 0.25, 0, 0],
    leftFingers:      'fist',
    rightUpperArmRot: [0.5, 0, -2.2],
    rightLowerArmRot: [0.7 + hop * 0.25, 0, 0],
    rightFingers:     'fist',
    expressions: { happy: 1.0 },
  };
}

// ── Blush (😳 Shy & Embarrassed) ──────────────────────────────────────────────
export function getBlushPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const shySway = Math.sin(t * 1.8) * 0.03;

  return {
    ...baseIdle,
    hipsRot: [0, 0.15, shySway],
    spineRot: [0.06, -0.1, -shySway],
    headRot: [0.22, -0.12, -0.14],

    // Hands clasped together shyly in front
    leftUpperArmRot:  [0.35, -0.2, -0.35],
    leftLowerArmRot:  [0.85, -0.1, -0.8],
    leftHandRot:      [0.2, 0, -0.3],
    leftFingers:      'relaxed',

    rightUpperArmRot: [0.35, 0.2, 0.35],
    rightLowerArmRot: [0.85, 0.1, 0.8],
    rightHandRot:     [0.2, 0, 0.3],
    rightFingers:     'relaxed',

    expressions: { relaxed: 0.6, happy: 0.4 },
  };
}

// ── Laugh (😄 Giggle & Laughter) ──────────────────────────────────────────────
export function getLaughPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const chuckle = Math.sin(t * 12.0) * 0.03;

  return {
    ...baseIdle,
    spineRot: [0.08 + chuckle, 0, 0],
    chestRot: [0.05 + chuckle * 1.5, 0, 0],
    headRot: [-0.15 + chuckle * 0.8, Math.sin(t * 3.0) * 0.05, 0.08],

    // Right hand covering mouth gently while laughing
    rightUpperArmRot: [0.38, 0.35, -0.4],
    rightLowerArmRot: [0.65, 0.2, -1.6],
    rightHandRot:     [0.4, -0.1, 0],
    rightFingers:     'relaxed',

    leftUpperArmRot:  [0.2, -0.2, -0.75],
    leftLowerArmRot:  [0.7, -0.15, -0.4],
    leftFingers:      'relaxed',

    expressions: { happy: 1.0 },
  };
}

// ── Listen (👂 Attentive Lean-In) ─────────────────────────────────────────────
export function getListenPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    // Leans forward slightly toward user
    spineRot: [0.12, 0, 0],
    chestRot: [0.08, 0, 0],
    headRot: [-0.08, 0.05, 0.15],

    // Attentive posture with arms loosely folded
    leftUpperArmRot:  [0.25, -0.2, -0.45],
    leftLowerArmRot:  [0.75, -0.15, -0.65],
    leftFingers:      'relaxed',

    rightUpperArmRot: [0.25, 0.2, 0.45],
    rightLowerArmRot: [0.75, 0.15, 0.65],
    rightFingers:     'relaxed',

    expressions: { neutral: 0.6, happy: 0.3 },
  };
}

// ── Talking (Communicative Gestures with Speech) ───────────────────────────────
export function getTalkingPose(t: number, baseIdle: VRMPose): VRMPose {
  const g1 = Math.sin(t * 3.6);
  const g2 = Math.cos(t * 2.8);

  return {
    ...baseIdle,
    spineRot: [0.03 + g1 * 0.015, g2 * 0.02, 0],
    headRot: [
      (baseIdle.headRot?.[0] || 0) + Math.sin(t * 4.8) * 0.04,
      (baseIdle.headRot?.[1] || 0) + Math.cos(t * 2.2) * 0.03,
      (baseIdle.headRot?.[2] || 0) + g1 * 0.02,
    ],

    // Natural expressive arm movements
    rightUpperArmRot: [0.32 + g2 * 0.12, 0.18, 0.82 + g1 * 0.16],
    rightLowerArmRot: [0.52 + g2 * 0.18, 0.3, 0.22],
    rightHandRot:     [0.18 + g1 * 0.1, 0, 0],
    rightFingers:     'open',

    leftUpperArmRot:  [0.15, -0.15, -0.9 + g2 * 0.08],
    leftLowerArmRot:  [0.35, -0.1, -0.15],
    leftFingers:      'relaxed',
  };
}

// ── Thinking (Curious Pondering 🤔) ────────────────────────────────────────────
export function getThinkingPose(t: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.04, -0.05, -0.02],
    headRot: [-0.14, -0.18, -0.16],

    // Right hand resting on chin
    rightUpperArmRot: [0.38, 0.38, -0.38],
    rightLowerArmRot: [0.68, 0.32, -1.48],
    rightHandRot:     [0.32, 0, 0],
    rightFingers:     'relaxed',

    leftUpperArmRot:  [0.2, -0.2, -0.7],
    leftLowerArmRot:  [0.75, -0.2, -0.5],
    leftFingers:      'relaxed',

    expressions: { neutral: 0.6, lookUp: 0.45 },
  };
}
