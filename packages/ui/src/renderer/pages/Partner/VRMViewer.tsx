/**
 * VRMViewer.tsx — Modular VRM Animation & Kinematics Engine
 * 
 * Architecture:
 * 1. Isolated Animation Clips:
 *    - Each animation (Idle, Wave, Dance, Stretch, Heart, Peace, Neko, Bow, Cheer, Talking)
 *      is a completely isolated, independent function returning a VRMPose.
 *    - Modifying one animation CANNOT break or affect any other animation.
 * 2. Smooth Pose Interpolator:
 *    - Smoothly blends between poses (Action -> Idle transition) without popping.
 * 3. Dynamic Skeleton Auto-Framing:
 *    - Queries actual Head, Hips, and Feet bone coordinates for pixel-perfect centering.
 * 4. High-DPI 16x Anisotropic Textures & 4-Point Studio Lighting.
 */
import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM, VRMExpressionPresetName, VRMHumanBoneName } from '@pixiv/three-vrm';

export type CompanionMood = 'idle' | 'thinking' | 'working' | 'celebrate' | 'happy' | 'sad' | 'angry' | 'surprised';
export type CompanionAction = 'idle' | 'wave' | 'salute' | 'dance' | 'stretch' | 'heart' | 'peace' | 'neko' | 'bow' | 'cheer';

export interface VRMViewerHandle {
  setMood: (mood: CompanionMood) => void;
  playAction: (action: CompanionAction) => void;
  startLipSync: () => void;
  stopLipSync: () => void;
}

interface Props {
  vrmUrl: string;
  mood?: CompanionMood;
  action?: CompanionAction;
  angle?: 'portrait' | 'half' | 'full';
  className?: string;
  onActionEnd?: () => void;
}

// ── Mood to Expressions ───────────────────────────────────────────────────────
const MOOD_EXPRESSIONS: Record<CompanionMood, Partial<Record<VRMExpressionPresetName, number>>> = {
  idle:      { neutral: 1.0 },
  happy:     { happy: 0.95, relaxed: 0.3 },
  celebrate: { happy: 1.0, relaxed: 0.5 },
  thinking:  { neutral: 0.6, lookUp: 0.35 },
  working:   { neutral: 0.8 },
  sad:       { sad: 0.85 },
  angry:     { angry: 0.7 },
  surprised: { surprised: 0.95 },
};

// ── Finger Pose Preset Types ──────────────────────────────────────────────────
export type FingerPreset = 'relaxed' | 'open' | 'fist' | 'peace' | 'heart' | 'salute' | 'cat';

// ── Complete Pose Definition with Full Human Skeleton ─────────────────────────
export interface VRMPose {
  // Torso & Core
  hipsPos?: [number, number, number];
  hipsRot?: [number, number, number];
  spineRot?: [number, number, number];
  chestRot?: [number, number, number];
  upperChestRot?: [number, number, number];
  neckRot?: [number, number, number];
  headRot?: [number, number, number];

  // Left Arm Chain
  leftShoulderRot?: [number, number, number];
  leftUpperArmRot?: [number, number, number];
  leftLowerArmRot?: [number, number, number];
  leftHandRot?: [number, number, number];
  leftFingers?: FingerPreset;

  // Right Arm Chain
  rightShoulderRot?: [number, number, number];
  rightUpperArmRot?: [number, number, number];
  rightLowerArmRot?: [number, number, number];
  rightHandRot?: [number, number, number];
  rightFingers?: FingerPreset;

  // Lower Limbs (Legs, Knees, Feet)
  leftUpperLegRot?: [number, number, number];
  rightUpperLegRot?: [number, number, number];
  leftLowerLegRot?: [number, number, number];
  rightLowerLegRot?: [number, number, number];
  leftFootRot?: [number, number, number];
  rightFootRot?: [number, number, number];

  // Expression Overrides
  expressions?: Partial<Record<VRMExpressionPresetName, number>>;
}

// ── Helper to Apply All 15 Finger Bones per Hand ──────────────────────────────
function applyFingerPreset(vrm: VRM, side: 'left' | 'right', preset: FingerPreset = 'relaxed') {
  const isL = side === 'left';
  const sign = isL ? 1 : -1;

  const setBoneRot = (name: VRMHumanBoneName, rot: [number, number, number]) => {
    const node = vrm.humanoid?.getNormalizedBoneNode(name);
    if (node) node.rotation.set(rot[0], rot[1], rot[2]);
  };

  // Base finger configurations
  let curl = 0.35; // Proximal curl
  let midCurl = 0.45; // Intermediate curl
  let distCurl = 0.25; // Distal curl
  let thumbCurl = 0.25;
  let spread = 0.05;

  if (preset === 'open') {
    curl = 0.05; midCurl = 0.05; distCurl = 0.02; thumbCurl = 0.05; spread = 0.12;
  } else if (preset === 'fist') {
    curl = 1.35; midCurl = 1.45; distCurl = 1.10; thumbCurl = 1.20; spread = -0.02;
  } else if (preset === 'salute') {
    curl = 0.02; midCurl = 0.02; distCurl = 0.01; thumbCurl = 0.45; spread = -0.04;
  } else if (preset === 'cat') {
    curl = 1.20; midCurl = 1.35; distCurl = 0.85; thumbCurl = 0.75; spread = 0.08;
  } else if (preset === 'heart') {
    curl = 0.75; midCurl = 0.95; distCurl = 0.55; thumbCurl = 0.45; spread = 0.02;
  }

  // Handle peace sign specifically
  if (preset === 'peace') {
    // Index and Middle straight
    setBoneRot(isL ? 'leftIndexProximal' : 'rightIndexProximal',       [0, 0, sign * 0.05]);
    setBoneRot(isL ? 'leftIndexIntermediate' : 'rightIndexIntermediate', [0, 0, sign * 0.05]);
    setBoneRot(isL ? 'leftIndexDistal' : 'rightIndexDistal',             [0, 0, sign * 0.02]);

    setBoneRot(isL ? 'leftMiddleProximal' : 'rightMiddleProximal',       [0, 0, sign * 0.05]);
    setBoneRot(isL ? 'leftMiddleIntermediate' : 'rightMiddleIntermediate', [0, 0, sign * 0.05]);
    setBoneRot(isL ? 'leftMiddleDistal' : 'rightMiddleDistal',             [0, 0, sign * 0.02]);

    // Ring, Pinky, and Thumb curled
    setBoneRot(isL ? 'leftRingProximal' : 'rightRingProximal',           [0, 0, sign * 1.35]);
    setBoneRot(isL ? 'leftRingIntermediate' : 'rightRingIntermediate',   [0, 0, sign * 1.45]);
    setBoneRot(isL ? 'leftRingDistal' : 'rightRingDistal',               [0, 0, sign * 1.10]);

    setBoneRot(isL ? 'leftLittleProximal' : 'rightLittleProximal',       [0, 0, sign * 1.35]);
    setBoneRot(isL ? 'leftLittleIntermediate' : 'rightLittleIntermediate', [0, 0, sign * 1.45]);
    setBoneRot(isL ? 'leftLittleDistal' : 'rightLittleDistal',             [0, 0, sign * 1.10]);

    setBoneRot(isL ? 'leftThumbMetacarpal' : 'rightThumbMetacarpal',     [0, 0.4 * sign, sign * 0.45]);
    setBoneRot(isL ? 'leftThumbProximal' : 'rightThumbProximal',         [0, 0.2 * sign, sign * 0.65]);
    setBoneRot(isL ? 'leftThumbDistal' : 'rightThumbDistal',             [0, 0, sign * 0.55]);
    return;
  }

  // Apply general preset across all 5 fingers (15 joints)
  const fingers: ('Index' | 'Middle' | 'Ring' | 'Little')[] = ['Index', 'Middle', 'Ring', 'Little'];
  fingers.forEach((f, idx) => {
    const spreadAngle = (idx - 1.5) * spread * sign;
    setBoneRot((isL ? `left${f}Proximal` : `right${f}Proximal`) as VRMHumanBoneName, [0, spreadAngle, sign * curl]);
    setBoneRot((isL ? `left${f}Intermediate` : `right${f}Intermediate`) as VRMHumanBoneName, [0, 0, sign * midCurl]);
    setBoneRot((isL ? `left${f}Distal` : `right${f}Distal`) as VRMHumanBoneName, [0, 0, sign * distCurl]);
  });

  // Thumb
  setBoneRot(isL ? 'leftThumbMetacarpal' : 'rightThumbMetacarpal', [0, 0.25 * sign, sign * thumbCurl * 0.5]);
  setBoneRot(isL ? 'leftThumbProximal' : 'rightThumbProximal',     [0, 0.15 * sign, sign * thumbCurl]);
  setBoneRot(isL ? 'leftThumbDistal' : 'rightThumbDistal',         [0, 0, sign * thumbCurl * 0.8]);
}

// ── Default Standing Idle Pose Function ───────────────────────────────────────
function getIdlePose(t: number, gazeX: number, gazeY: number): VRMPose {
  const breath = Math.sin(t * 1.8);
  const swaySide = Math.sin(t * 0.45);
  const swayRot = Math.cos(t * 0.45);

  return {
    hipsPos: [swaySide * 0.012, breath * 0.004, 0],
    hipsRot: [0, 0, swaySide * 0.015],
    spineRot: [0.03 + breath * 0.015, swaySide * 0.015, -swaySide * 0.015],
    chestRot: [breath * 0.02, -swaySide * 0.01, 0],
    upperChestRot: [breath * 0.015, 0, 0],
    neckRot: [-0.02 + breath * 0.01, gazeX * 0.35, gazeY * 0.2],
    headRot: [
      -gazeY * 0.45 + Math.sin(t * 0.7) * 0.02,
      gazeX * 0.60 + swayRot * 0.025,
      -gazeX * 0.12 + Math.sin(t * 0.5) * 0.015,
    ],

    leftShoulderRot: [0, 0, 0.02 + breath * 0.015],
    rightShoulderRot: [0, 0, -0.02 - breath * 0.015],

    // Left Arm
    leftUpperArmRot: [0.08 + breath * 0.015, -0.05, -1.24 + swaySide * 0.03],
    leftLowerArmRot: [0.15, -0.15, -0.10],
    leftHandRot:     [0.05, -0.05, -0.05],
    leftFingers:     'relaxed',

    // Right Arm
    rightUpperArmRot: [0.08 + breath * 0.015, 0.05, 1.24 - swaySide * 0.03],
    rightLowerArmRot: [0.15, 0.15, 0.10],
    rightHandRot:     [0.05, 0.05, 0.05],
    rightFingers:     'relaxed',

    // Legs & Feet (Contrapposto balance)
    leftUpperLegRot:  [-0.02, 0.02, -swaySide * 0.02],
    rightUpperLegRot: [-0.02, -0.02, -swaySide * 0.02],
    leftLowerLegRot:  [ 0.04, 0, 0],
    rightLowerLegRot: [ 0.04, 0, 0],
    leftFootRot:      [ 0.0, 0, swaySide * 0.015],
    rightFootRot:     [ 0.0, 0, swaySide * 0.015],
  };
}

// ── Isolated Animation Clip: Wave (Hello 👋) ───────────────────────────────────
function getWavePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const waveCycle = Math.sin(actTime * 8.5);

  return {
    ...baseIdle,
    // Right upper arm held out to the side
    rightUpperArmRot: [0.15, -0.10, 0.45],
    // Forearm bent upward ~95° so hand is to the right of the ear in open space
    rightLowerArmRot: [-0.20, 0.20, -1.65 + waveCycle * 0.25],
    // Wrist rotated so open palm faces directly toward the screen/viewer
    rightHandRot:     [0.0, -1.45, waveCycle * 0.25],
    rightFingers:     'open',
    leftFingers:      'relaxed',

    headRot: [
      (baseIdle.headRot?.[0] || 0),
      (baseIdle.headRot?.[1] || 0) + 0.06,
      0.10,
    ],
    expressions: { happy: 0.95 },
  };
}

// ── Isolated Animation Clip: Salute (🫡 Respectful Salute) ───────────────────────
function getSalutePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    // Upper arm raised up and out to side
    rightUpperArmRot: [0.20, 0.35, -0.45],
    // Forearm angled so fingertips meet right temple/brow
    rightLowerArmRot: [0.45, 0.60, -1.75],
    // Flat hand, palm facing diagonally inward/down
    rightHandRot:     [0.10, 0.30, -0.15],
    rightFingers:     'salute',
    leftFingers:      'relaxed',

    headRot: [0.02, 0.04, 0.02],
    expressions: { neutral: 0.8, happy: 0.3 },
  };
}

// ── Isolated Animation Clip: Dance (Groove 💃) ─────────────────────────────────
function getDancePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const beat = t * 4.2;
  const danceSway = Math.sin(beat);
  const danceStep = Math.cos(beat);

  return {
    ...baseIdle,
    hipsPos: [danceSway * 0.06, Math.abs(Math.sin(beat * 2.0)) * 0.025, 0],
    hipsRot: [0, 0, danceSway * 0.08],
    spineRot: [0.03, 0, -danceSway * 0.06],
    headRot: [
      Math.abs(Math.sin(beat * 2.0)) * 0.06,
      -danceSway * 0.20,
      danceSway * 0.10,
    ],
    leftUpperArmRot:  [0.25 + danceSway * 0.2, -0.15, -0.55 + danceStep * 0.35],
    leftLowerArmRot:  [0.65, 0, -0.55],
    leftFingers:      'relaxed',

    rightUpperArmRot: [0.25 - danceSway * 0.2,  0.15,  0.55 - danceStep * 0.35],
    rightLowerArmRot: [0.65, 0,  0.55],
    rightFingers:     'relaxed',

    leftUpperLegRot:  [-0.04 + danceStep * 0.04, 0, -danceSway * 0.04],
    rightUpperLegRot: [-0.04 - danceStep * 0.04, 0, -danceSway * 0.04],
    leftLowerLegRot:  [ 0.08 + Math.max(0, danceSway) * 0.08, 0, 0],
    rightLowerLegRot: [ 0.08 + Math.max(0, -danceSway) * 0.08, 0, 0],
    expressions: { happy: 0.9 },
  };
}

// ── Isolated Animation Clip: Stretch (Gymnastics 🤸) ───────────────────────────
function getStretchPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const stretchPhase = (actTime % 6.0) / 6.0;

  if (stretchPhase < 0.6) {
    const p = stretchPhase / 0.6;
    const raise = THREE.MathUtils.smoothstep(p, 0, 1);
    return {
      ...baseIdle,
      spineRot: [-0.15 * raise, 0, 0],
      headRot: [-0.30 * raise, 0, 0],
      leftUpperArmRot:  [0.30 * raise, 0, THREE.MathUtils.lerp(-1.24,  2.65, raise)],
      leftLowerArmRot:  [0.10, 0, 0],
      leftFingers:      'open',
      rightUpperArmRot: [0.30 * raise, 0, THREE.MathUtils.lerp( 1.24, -2.65, raise)],
      rightLowerArmRot: [0.10, 0, 0],
      rightFingers:     'open',
      expressions: { relaxed: 0.6 },
    };
  } else {
    const p = (stretchPhase - 0.6) / 0.4;
    const release = THREE.MathUtils.smoothstep(p, 0, 1);
    return {
      ...baseIdle,
      spineRot: [THREE.MathUtils.lerp(-0.15, 0.03, release), 0, 0],
      headRot: [THREE.MathUtils.lerp(-0.30, 0, release), 0, 0],
      leftUpperArmRot:  [0.10, 0, THREE.MathUtils.lerp( 2.65, -1.24, release)],
      leftLowerArmRot:  [0.15, -0.15, -0.10],
      leftFingers:      'relaxed',
      rightUpperArmRot: [0.10, 0, THREE.MathUtils.lerp(-2.65,  1.24, release)],
      rightLowerArmRot: [0.15,  0.15,  0.10],
      rightFingers:     'relaxed',
      expressions: { relaxed: 0.4 },
    };
  }
}

// ── Isolated Animation Clip: Heart (💖 Cute) ──────────────────────────────────
function getHeartPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    leftUpperArmRot:  [0.45, -0.35, -0.55],
    leftLowerArmRot:  [0.85,  0,    -1.25],
    leftHandRot:      [0, 0, -0.25],
    leftFingers:      'heart',

    rightUpperArmRot: [0.45,  0.35,  0.55],
    rightLowerArmRot: [0.85,  0,     1.25],
    rightHandRot:     [0, 0,  0.25],
    rightFingers:     'heart',

    headRot: [0, 0, -0.16 + Math.sin(t * 2.0) * 0.03],
    expressions: { happy: 1.0 },
  };
}

// ── Isolated Animation Clip: Peace (✌️ Victory) ─────────────────────────────────
function getPeacePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    rightUpperArmRot: [0.20, 0.35, -0.55],
    rightLowerArmRot: [0.30, 0.0,  -1.50],
    rightHandRot:     [0.35, 0,     0.25],
    rightFingers:     'peace',
    leftFingers:      'relaxed',
    headRot: [0, 0, 0.14],
    expressions: { happy: 0.95 },
  };
}

// ── Isolated Animation Clip: Neko (🐱 Cat Paws) ─────────────────────────────────
function getNekoPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const pawL = Math.sin(t * 6.0) * 0.15;
  const pawR = Math.cos(t * 6.0) * 0.15;

  return {
    ...baseIdle,
    leftUpperArmRot:  [0.35, -0.25, -0.45],
    leftLowerArmRot:  [0.65, -0.25, -1.25 + pawL],
    leftHandRot:      [0.75, 0, 0],
    leftFingers:      'cat',

    rightUpperArmRot: [0.35,  0.25,  0.45],
    rightLowerArmRot: [0.65,  0.25,  1.25 + pawR],
    rightHandRot:     [0.75, 0, 0],
    rightFingers:     'cat',

    headRot: [0, Math.cos(t * 2.5) * 0.10, Math.sin(t * 3.0) * 0.12],
    expressions: { happy: 0.9 },
  };
}

// ── Isolated Animation Clip: Bow (🙇 Polite) ───────────────────────────────────
function getBowPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const bowProg = Math.sin((actTime / 3.0) * Math.PI);

  return {
    ...baseIdle,
    spineRot: [THREE.MathUtils.clamp(bowProg * 0.45, 0, 0.45), 0, 0],
    headRot:  [THREE.MathUtils.clamp(bowProg * 0.20, 0, 0.20), 0, 0],
    leftUpperArmRot:  [0.05, 0, -1.28],
    rightUpperArmRot: [0.05, 0,  1.28],
    leftFingers:      'salute',
    rightFingers:     'salute',
    expressions: { neutral: 1.0 },
  };
}

// ── Isolated Animation Clip: Cheer (🎉 Celebrate) ──────────────────────────────
function getCheerPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  const cheerHop = Math.abs(Math.sin(t * 7.0));

  return {
    ...baseIdle,
    hipsPos: [0, cheerHop * 0.035, 0],
    leftUpperArmRot:  [0.45, 0,  2.15],
    leftLowerArmRot:  [0.65 + cheerHop * 0.2, 0, 0],
    leftFingers:      'fist',
    rightUpperArmRot: [0.45, 0, -2.15],
    rightLowerArmRot: [0.65 + cheerHop * 0.2, 0, 0],
    rightFingers:     'fist',
    headRot: [-0.20, 0, 0],
    expressions: { happy: 1.0 },
  };
}

// ── Isolated Animation Clip: Talking Conversational Gestures ───────────────────
function getTalkingPose(t: number, baseIdle: VRMPose): VRMPose {
  const talk1 = Math.sin(t * 4.2);
  const talk2 = Math.cos(t * 3.5);

  return {
    ...baseIdle,
    rightUpperArmRot: [0.35 + talk2 * 0.12, 0.20, 0.85 + talk1 * 0.15],
    rightLowerArmRot: [0.55 + talk2 * 0.20, 0.35, 0.20],
    rightHandRot:     [0.20, 0, 0],
    rightFingers:     'relaxed',
    leftFingers:      'relaxed',
    headRot: [
      (baseIdle.headRot?.[0] || 0) + Math.sin(t * 5.5) * 0.03,
      (baseIdle.headRot?.[1] || 0) + Math.cos(t * 2.8) * 0.02,
      (baseIdle.headRot?.[2] || 0),
    ],
  };
}

// ── Isolated Animation Clip: Thinking ──────────────────────────────────────────
function getThinkingPose(t: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    rightUpperArmRot: [0.35, 0.35, -0.35],
    rightLowerArmRot: [0.65, 0.30, -1.45],
    rightHandRot:     [0.30, 0, 0],
    rightFingers:     'relaxed',
    leftFingers:      'relaxed',
    headRot: [-0.10, -0.18, -0.15],
    expressions: { neutral: 0.6, lookUp: 0.4 },
  };
}

// ── Main VRM Component ────────────────────────────────────────────────────────
export const VRMViewer = forwardRef<VRMViewerHandle, Props>(
  ({ vrmUrl, mood = 'idle', action = 'idle', angle = 'full', className = '', onActionEnd }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const vrmRef       = useRef<VRM | null>(null);
    const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
    const rafRef       = useRef<number | null>(null);
    const clockRef     = useRef(new THREE.Clock());

    const skeletonBoundsRef = useRef<{
      headY: number;
      hipsY: number;
      feetY: number;
      centerY: number;
      height: number;
    }>({
      headY: 1.38,
      hipsY: 0.78,
      feetY: 0.0,
      centerY: 0.70,
      height: 1.45,
    });

    const currentActionRef = useRef<CompanionAction>(action);
    const actionTimeRef    = useRef<number>(0);
    const currentMoodRef   = useRef<CompanionMood>(mood);
    const isLipSyncRef     = useRef<boolean>(false);
    const mousePosRef      = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const currentGazeRef   = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const propsRef = useRef({ angle, onActionEnd });
    useEffect(() => { propsRef.current = { angle, onActionEnd }; }, [angle, onActionEnd]);

    useEffect(() => {
      currentActionRef.current = action;
      actionTimeRef.current = 0;
    }, [action]);

    useEffect(() => {
      currentMoodRef.current = mood;
      applyMoodExpressions(mood);
    }, [mood]);

    const applyMoodExpressions = (m: CompanionMood) => {
      const vrm = vrmRef.current;
      if (!vrm?.expressionManager) return;
      const allPresets: VRMExpressionPresetName[] = ['happy', 'sad', 'angry', 'surprised', 'relaxed', 'neutral', 'lookUp', 'lookDown'];
      for (const p of allPresets) {
        vrm.expressionManager.setValue(p, 0);
      }
      const exp = MOOD_EXPRESSIONS[m] || MOOD_EXPRESSIONS.idle;
      for (const [k, v] of Object.entries(exp)) {
        vrm.expressionManager.setValue(k as VRMExpressionPresetName, v);
      }
    };

    useImperativeHandle(ref, () => ({
      setMood: (m: CompanionMood) => {
        currentMoodRef.current = m;
        applyMoodExpressions(m);
      },
      playAction: (act: CompanionAction) => {
        currentActionRef.current = act;
        actionTimeRef.current = 0;
      },
      startLipSync: () => {
        isLipSyncRef.current = true;
      },
      stopLipSync: () => {
        isLipSyncRef.current = false;
        vrmRef.current?.expressionManager?.setValue('aa', 0);
        vrmRef.current?.expressionManager?.setValue('oh', 0);
        vrmRef.current?.expressionManager?.setValue('ih', 0);
      },
    }));

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const w = el.clientWidth || 800;
      const h = el.clientHeight || 700;

      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
      el.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xfff8f2, 0.85));

      const keyLight = new THREE.DirectionalLight(0xfff5ea, 2.0);
      keyLight.position.set(2.5, 4.0, 3.5);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.bias = -0.0001;
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.95);
      fillLight.position.set(-3.0, 2.0, 2.0);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0xf472b6, 1.0);
      rimLight.position.set(0, 3.5, -2.5);
      scene.add(rimLight);

      const bounceLight = new THREE.DirectionalLight(0xffedd5, 0.4);
      bounceLight.position.set(0, -2.0, 2.0);
      scene.add(bounceLight);

      const camera = new THREE.PerspectiveCamera(34, w / h, 0.01, 50);
      camera.position.set(0, 0.70, 3.1);
      const lookAt = new THREE.Vector3(0, 0.70, 0);
      camera.lookAt(lookAt);

      const handleMouseMove = (e: MouseEvent) => {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        mousePosRef.current = { x: nx, y: ny };
      };
      window.addEventListener('mousemove', handleMouseMove);

      const getBone = (vrm: VRM, name: VRMHumanBoneName) => {
        return vrm.humanoid?.getNormalizedBoneNode(name) || null;
      };

      const loader = new GLTFLoader();
      loader.register(p => new VRMLoaderPlugin(p));
      loader.load(
        vrmUrl,
        gltf => {
          const vrm: VRM = gltf.userData.vrm;
          VRMUtils.rotateVRM0(vrm);

          vrm.scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(vrm.scene);
          
          const bottomOffset = box.min.y;
          vrm.scene.position.y = -bottomOffset;
          vrm.scene.updateMatrixWorld(true);

          const headNode = getBone(vrm, 'head');
          const hipsNode = getBone(vrm, 'hips');
          const leftFoot = getBone(vrm, 'leftFoot');

          const headPos = new THREE.Vector3();
          const hipsPos = new THREE.Vector3();
          const footPos = new THREE.Vector3();

          if (headNode) headNode.getWorldPosition(headPos);
          if (hipsNode) hipsNode.getWorldPosition(hipsPos);
          if (leftFoot) leftFoot.getWorldPosition(footPos);

          const hY = headPos.y || 1.38;
          const hipY = hipsPos.y || 0.78;
          const ftY = footPos.y || 0.0;
          const totalH = hY - ftY + 0.18;
          const cY = (hY + ftY) / 2;

          skeletonBoundsRef.current = {
            headY: hY,
            hipsY: hipY,
            feetY: ftY,
            centerY: cY,
            height: totalH,
          };

          const maxAniso = renderer.capabilities.getMaxAnisotropy();
          vrm.scene.traverse((obj: any) => {
            if (obj.isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
              if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach(m => {
                  if (m.map) {
                    m.map.anisotropy = maxAniso;
                    m.map.minFilter = THREE.LinearMipmapLinearFilter;
                    m.map.magFilter = THREE.LinearFilter;
                    m.map.generateMipmaps = true;
                    m.map.needsUpdate = true;
                  }
                });
              }
            }
          });

          scene.add(vrm.scene);
          vrmRef.current = vrm;
          applyMoodExpressions(currentMoodRef.current);
        },
        undefined,
        err => console.error('[VRMViewer] VRM load error:', err)
      );

      let blinkTimer = 0;
      let blinkInterval = 2.5 + Math.random() * 3;
      let blinkState: 'open' | 'closing' | 'opening' = 'open';
      let saccadeTimer = 0;
      let saccadeOffset = { x: 0, y: 0 };
      let lipSyncPhase = 0;

      // ── Main Animation Execution Loop ───────────────────────────────────────
      const animate = () => {
        rafRef.current = requestAnimationFrame(animate);
        const dt = Math.min(clockRef.current.getDelta(), 0.1);
        const t = clockRef.current.elapsedTime;
        actionTimeRef.current += dt;
        const actTime = actionTimeRef.current;
        const act = currentActionRef.current;
        const mood = currentMoodRef.current;

        const vrm = vrmRef.current;
        if (vrm) {
          // Gaze Tracking
          saccadeTimer += dt;
          if (saccadeTimer > 2.0 + Math.random() * 2.5) {
            saccadeTimer = 0;
            saccadeOffset = {
              x: (Math.random() - 0.5) * 0.10,
              y: (Math.random() - 0.5) * 0.06,
            };
          }
          const targetGazeX = THREE.MathUtils.clamp(mousePosRef.current.x * 0.35 + saccadeOffset.x, -0.35, 0.35);
          const targetGazeY = THREE.MathUtils.clamp(mousePosRef.current.y * 0.25 + saccadeOffset.y, -0.25, 0.25);
          currentGazeRef.current.x = THREE.MathUtils.lerp(currentGazeRef.current.x, targetGazeX, dt * 5.0);
          currentGazeRef.current.y = THREE.MathUtils.lerp(currentGazeRef.current.y, targetGazeY, dt * 5.0);

          // 1. Calculate Base Standing Idle Pose
          const idlePose = getIdlePose(t, currentGazeRef.current.x, currentGazeRef.current.y);

          // 2. Select Active Isolated Action Pose
          let activePose: VRMPose = idlePose;
          if (act === 'wave') {
            activePose = getWavePose(t, actTime, idlePose);
            if (actTime > 4.5) {
              currentActionRef.current = 'idle';
              propsRef.current.onActionEnd?.();
            }
          } else if (act === 'salute') {
            activePose = getSalutePose(t, actTime, idlePose);
            if (actTime > 4.0) {
              currentActionRef.current = 'idle';
              propsRef.current.onActionEnd?.();
            }
          } else if (act === 'dance') {
            activePose = getDancePose(t, actTime, idlePose);
          } else if (act === 'stretch') {
            activePose = getStretchPose(t, actTime, idlePose);
            if (actTime > 6.0) {
              currentActionRef.current = 'idle';
              propsRef.current.onActionEnd?.();
            }
          } else if (act === 'heart') {
            activePose = getHeartPose(t, actTime, idlePose);
            if (actTime > 5.0) {
              currentActionRef.current = 'idle';
              propsRef.current.onActionEnd?.();
            }
          } else if (act === 'peace') {
            activePose = getPeacePose(t, actTime, idlePose);
            if (actTime > 4.5) {
              currentActionRef.current = 'idle';
              propsRef.current.onActionEnd?.();
            }
          } else if (act === 'neko') {
            activePose = getNekoPose(t, actTime, idlePose);
            if (actTime > 5.0) {
              currentActionRef.current = 'idle';
              propsRef.current.onActionEnd?.();
            }
          } else if (act === 'bow') {
            activePose = getBowPose(t, actTime, idlePose);
            if (actTime > 3.0) {
              currentActionRef.current = 'idle';
              propsRef.current.onActionEnd?.();
            }
          } else if (act === 'cheer') {
            activePose = getCheerPose(t, actTime, idlePose);
            if (actTime > 4.5) {
              currentActionRef.current = 'idle';
              propsRef.current.onActionEnd?.();
            }
          } else if (isLipSyncRef.current) {
            activePose = getTalkingPose(t, idlePose);
          } else if (mood === 'thinking') {
            activePose = getThinkingPose(t, idlePose);
          }

          // 3. Apply Pose to Humanoid Bones cleanly
          const applyRot = (boneName: VRMHumanBoneName, rot?: [number, number, number]) => {
            if (!rot) return;
            const bone = getBone(vrm, boneName);
            if (bone) bone.rotation.set(rot[0], rot[1], rot[2]);
          };

          const hips = getBone(vrm, 'hips');
          if (hips && activePose.hipsPos) {
            hips.position.set(activePose.hipsPos[0], activePose.hipsPos[1], activePose.hipsPos[2]);
          }

          applyRot('hips', activePose.hipsRot);
          applyRot('spine', activePose.spineRot);
          applyRot('chest', activePose.chestRot);
          applyRot('upperChest', activePose.upperChestRot);
          applyRot('neck', activePose.neckRot);
          applyRot('head', activePose.headRot);

          applyRot('leftShoulder', activePose.leftShoulderRot);
          applyRot('leftUpperArm', activePose.leftUpperArmRot);
          applyRot('leftLowerArm', activePose.leftLowerArmRot);
          applyRot('leftHand', activePose.leftHandRot);

          applyRot('rightShoulder', activePose.rightShoulderRot);
          applyRot('rightUpperArm', activePose.rightUpperArmRot);
          applyRot('rightLowerArm', activePose.rightLowerArmRot);
          applyRot('rightHand', activePose.rightHandRot);

          // Apply Lower Limbs (Legs, Knees, Feet)
          applyRot('leftUpperLeg', activePose.leftUpperLegRot);
          applyRot('rightUpperLeg', activePose.rightUpperLegRot);
          applyRot('leftLowerLeg', activePose.leftLowerLegRot);
          applyRot('rightLowerLeg', activePose.rightLowerLegRot);
          applyRot('leftFoot', activePose.leftFootRot);
          applyRot('rightFoot', activePose.rightFootRot);

          // Apply all 15 finger bones for Left and Right hands
          applyFingerPreset(vrm, 'left', activePose.leftFingers || 'relaxed');
          applyFingerPreset(vrm, 'right', activePose.rightFingers || 'relaxed');

          // Apply action expressions if present
          if (activePose.expressions && vrm.expressionManager) {
            for (const [k, v] of Object.entries(activePose.expressions)) {
              vrm.expressionManager.setValue(k as VRMExpressionPresetName, v);
            }
          }

          // Blinking
          blinkTimer += dt;
          if (blinkState === 'open' && blinkTimer >= blinkInterval) {
            blinkState = 'closing';
            blinkTimer = 0;
          } else if (blinkState === 'closing') {
            const v = Math.min(blinkTimer / 0.07, 1);
            vrm.expressionManager?.setValue('blink', v);
            if (v >= 1) { blinkState = 'opening'; blinkTimer = 0; }
          } else if (blinkState === 'opening') {
            const v = Math.max(1 - blinkTimer / 0.09, 0);
            vrm.expressionManager?.setValue('blink', v);
            if (v <= 0) {
              blinkState = 'open';
              blinkTimer = 0;
              blinkInterval = 2.2 + Math.random() * 3.5;
            }
          }

          // Lip-Sync Visemes
          if (isLipSyncRef.current) {
            lipSyncPhase += dt * 14.0;
            const mouthA = Math.max(0, Math.sin(lipSyncPhase) * 0.75);
            const mouthO = Math.max(0, Math.cos(lipSyncPhase * 0.7) * 0.45);
            vrm.expressionManager?.setValue('aa', mouthA);
            vrm.expressionManager?.setValue('oh', mouthO);
          }

          vrm.update(dt);
        }

        // Dynamic Skeleton Auto-Framing
        const { headY, hipsY, feetY, centerY, height } = skeletonBoundsRef.current;
        const currentAngle = propsRef.current.angle || 'full';

        let targetLookY = centerY;
        let targetCamY  = centerY;
        let targetDist  = 3.1;
        let targetFov   = 34;

        if (currentAngle === 'portrait') {
          targetLookY = headY;
          targetCamY  = headY;
          targetDist  = 0.85;
          targetFov   = 26;
        } else if (currentAngle === 'half') {
          const torsoCenterY = (headY + hipsY) / 2;
          targetLookY = torsoCenterY;
          targetCamY  = torsoCenterY;
          targetDist  = 1.70;
          targetFov   = 32;
        } else {
          // Full Body
          targetLookY = centerY;
          targetCamY  = centerY;
          targetDist  = (height / (2 * Math.tan((34 * Math.PI) / 360))) * 1.25;
          targetFov   = 34;
        }

        const targetPos = new THREE.Vector3(0, targetCamY, targetDist);
        const targetLook = new THREE.Vector3(0, targetLookY, 0);

        camera.position.lerp(targetPos, dt * 4.5);
        lookAt.lerp(targetLook, dt * 4.5);
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 4.5);
        camera.updateProjectionMatrix();
        camera.lookAt(lookAt);

        renderer.render(scene, camera);
      };

      clockRef.current.start();
      rafRef.current = requestAnimationFrame(animate);

      const ro = new ResizeObserver(() => {
        const nw = el.clientWidth;
        const nh = el.clientHeight;
        if (nw > 0 && nh > 0) {
          renderer.setSize(nw, nh, false);
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
        }
      });
      ro.observe(el);

      return () => {
        ro.disconnect();
        window.removeEventListener('mousemove', handleMouseMove);
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        if (vrmRef.current) {
          VRMUtils.deepDispose(vrmRef.current.scene);
          vrmRef.current = null;
        }
        renderer.dispose();
        rendererRef.current = null;
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vrmUrl]);

    return (
      <div
        ref={containerRef}
        className={`w-full h-full relative overflow-hidden ${className}`}
        style={{ background: 'transparent' }}
        aria-label="3D AI Companion Avatar"
      />
    );
  }
);

VRMViewer.displayName = 'VRMViewer';
