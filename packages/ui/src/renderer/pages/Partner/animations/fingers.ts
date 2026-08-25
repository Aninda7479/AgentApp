import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { FingerPreset } from './types';

/**
 * Apply all 15 finger bones per hand based on finger preset.
 * 
 * Note on VRM humanoid coordinates:
 * - Left hand flexion (curling inward toward palm) is NEGATIVE Z rotation.
 * - Right hand flexion (curling inward toward palm) is POSITIVE Z rotation.
 * - Spreading fingers occurs along Y axis.
 */
export function applyFingerPreset(
  vrm: VRM,
  side: 'left' | 'right',
  preset: FingerPreset = 'relaxed'
): void {
  const isL = side === 'left';
  // flexSign: -1 for left hand, +1 for right hand
  const flexSign = isL ? -1 : 1;
  const spreadSign = isL ? 1 : -1;

  const setBoneRot = (name: VRMHumanBoneName, rot: [number, number, number]) => {
    const node = vrm.humanoid?.getNormalizedBoneNode(name);
    if (node) node.rotation.set(rot[0], rot[1], rot[2]);
  };

  // ── 1. Peace Sign (✌️) ───────────────────────────────────────────────────────
  if (preset === 'peace') {
    // Index and Middle straight with spread
    setBoneRot(isL ? 'leftIndexProximal' : 'rightIndexProximal',          [0, spreadSign * 0.08, flexSign * 0.02]);
    setBoneRot(isL ? 'leftIndexIntermediate' : 'rightIndexIntermediate',  [0, 0, flexSign * 0.02]);
    setBoneRot(isL ? 'leftIndexDistal' : 'rightIndexDistal',              [0, 0, flexSign * 0.01]);

    setBoneRot(isL ? 'leftMiddleProximal' : 'rightMiddleProximal',        [0, -spreadSign * 0.05, flexSign * 0.02]);
    setBoneRot(isL ? 'leftMiddleIntermediate' : 'rightMiddleIntermediate',[0, 0, flexSign * 0.02]);
    setBoneRot(isL ? 'leftMiddleDistal' : 'rightMiddleDistal',            [0, 0, flexSign * 0.01]);

    // Ring and Little tightly curled into palm
    setBoneRot(isL ? 'leftRingProximal' : 'rightRingProximal',            [0, 0, flexSign * 1.35]);
    setBoneRot(isL ? 'leftRingIntermediate' : 'rightRingIntermediate',    [0, 0, flexSign * 1.45]);
    setBoneRot(isL ? 'leftRingDistal' : 'rightRingDistal',                [0, 0, flexSign * 1.10]);

    setBoneRot(isL ? 'leftLittleProximal' : 'rightLittleProximal',        [0, 0, flexSign * 1.35]);
    setBoneRot(isL ? 'leftLittleIntermediate' : 'rightLittleIntermediate',[0, 0, flexSign * 1.45]);
    setBoneRot(isL ? 'leftLittleDistal' : 'rightLittleDistal',            [0, 0, flexSign * 1.10]);

    // Thumb folded over curled fingers
    setBoneRot(isL ? 'leftThumbMetacarpal' : 'rightThumbMetacarpal',      [0.2, spreadSign * 0.4, flexSign * 0.5]);
    setBoneRot(isL ? 'leftThumbProximal' : 'rightThumbProximal',          [0.1, spreadSign * 0.2, flexSign * 0.7]);
    setBoneRot(isL ? 'leftThumbDistal' : 'rightThumbDistal',              [0, 0, flexSign * 0.6]);
    return;
  }

  // ── 2. Korean Finger Heart (🫰) ──────────────────────────────────────────────
  if (preset === 'finger_heart') {
    // Index slightly curved to cross thumb tip
    setBoneRot(isL ? 'leftIndexProximal' : 'rightIndexProximal',          [0.1, spreadSign * 0.05, flexSign * 0.55]);
    setBoneRot(isL ? 'leftIndexIntermediate' : 'rightIndexIntermediate',  [0, 0, flexSign * 0.65]);
    setBoneRot(isL ? 'leftIndexDistal' : 'rightIndexDistal',              [0, 0, flexSign * 0.35]);

    // Thumb opposed forward to touch index
    setBoneRot(isL ? 'leftThumbMetacarpal' : 'rightThumbMetacarpal',      [0.3, spreadSign * 0.35, flexSign * 0.25]);
    setBoneRot(isL ? 'leftThumbProximal' : 'rightThumbProximal',          [0.15, spreadSign * 0.2, flexSign * 0.35]);
    setBoneRot(isL ? 'leftThumbDistal' : 'rightThumbDistal',              [0, 0, flexSign * 0.25]);

    // Middle, Ring, Little curled into palm
    ['Middle', 'Ring', 'Little'].forEach((f) => {
      setBoneRot((isL ? `left${f}Proximal` : `right${f}Proximal`) as VRMHumanBoneName,       [0, 0, flexSign * 1.30]);
      setBoneRot((isL ? `left${f}Intermediate` : `right${f}Intermediate`) as VRMHumanBoneName, [0, 0, flexSign * 1.40]);
      setBoneRot((isL ? `left${f}Distal` : `right${f}Distal`) as VRMHumanBoneName,             [0, 0, flexSign * 1.05]);
    });
    return;
  }

  // ── 3. Pointing (👉) ────────────────────────────────────────────────────────
  if (preset === 'pointing') {
    // Index straight
    setBoneRot(isL ? 'leftIndexProximal' : 'rightIndexProximal',          [0, 0, flexSign * 0.02]);
    setBoneRot(isL ? 'leftIndexIntermediate' : 'rightIndexIntermediate',  [0, 0, flexSign * 0.02]);
    setBoneRot(isL ? 'leftIndexDistal' : 'rightIndexDistal',              [0, 0, flexSign * 0.01]);

    // Middle, Ring, Little curled into palm
    ['Middle', 'Ring', 'Little'].forEach((f) => {
      setBoneRot((isL ? `left${f}Proximal` : `right${f}Proximal`) as VRMHumanBoneName,       [0, 0, flexSign * 1.35]);
      setBoneRot((isL ? `left${f}Intermediate` : `right${f}Intermediate`) as VRMHumanBoneName, [0, 0, flexSign * 1.45]);
      setBoneRot((isL ? `left${f}Distal` : `right${f}Distal`) as VRMHumanBoneName,             [0, 0, flexSign * 1.10]);
    });

    // Thumb folded over middle finger
    setBoneRot(isL ? 'leftThumbMetacarpal' : 'rightThumbMetacarpal',      [0.2, spreadSign * 0.35, flexSign * 0.55]);
    setBoneRot(isL ? 'leftThumbProximal' : 'rightThumbProximal',          [0.1, spreadSign * 0.2, flexSign * 0.65]);
    setBoneRot(isL ? 'leftThumbDistal' : 'rightThumbDistal',              [0, 0, flexSign * 0.55]);
    return;
  }

  // ── 4. Thumbs Up (👍) ────────────────────────────────────────────────────────
  if (preset === 'thumbs_up') {
    // All 4 fingers curled tight into palm
    ['Index', 'Middle', 'Ring', 'Little'].forEach((f) => {
      setBoneRot((isL ? `left${f}Proximal` : `right${f}Proximal`) as VRMHumanBoneName,       [0, 0, flexSign * 1.38]);
      setBoneRot((isL ? `left${f}Intermediate` : `right${f}Intermediate`) as VRMHumanBoneName, [0, 0, flexSign * 1.48]);
      setBoneRot((isL ? `left${f}Distal` : `right${f}Distal`) as VRMHumanBoneName,             [0, 0, flexSign * 1.15]);
    });

    // Thumb extended straight up
    setBoneRot(isL ? 'leftThumbMetacarpal' : 'rightThumbMetacarpal',      [-0.15, spreadSign * 0.1, flexSign * 0.05]);
    setBoneRot(isL ? 'leftThumbProximal' : 'rightThumbProximal',          [0, 0, 0]);
    setBoneRot(isL ? 'leftThumbDistal' : 'rightThumbDistal',              [0, 0, 0]);
    return;
  }

  // ── 5. Standard Parametric Presets ──────────────────────────────────────────
  let curl = 0.22;       // Proximal flexion
  let midCurl = 0.32;    // Intermediate flexion
  let distCurl = 0.16;   // Distal flexion
  let thumbCurl = 0.20;
  let thumbSpread = 0.15;
  let spread = 0.04;

  if (preset === 'open') {
    curl = 0.02; midCurl = 0.02; distCurl = 0.01; thumbCurl = 0.05; thumbSpread = 0.08; spread = 0.12;
  } else if (preset === 'fist') {
    curl = 1.35; midCurl = 1.45; distCurl = 1.10; thumbCurl = 1.15; thumbSpread = 0.40; spread = -0.02;
  } else if (preset === 'salute') {
    curl = 0.01; midCurl = 0.01; distCurl = 0.01; thumbCurl = 0.30; thumbSpread = 0.10; spread = -0.04;
  } else if (preset === 'cat') {
    curl = 0.85; midCurl = 1.25; distCurl = 0.75; thumbCurl = 0.65; thumbSpread = 0.25; spread = 0.06;
  } else if (preset === 'heart') {
    curl = 0.45; midCurl = 0.75; distCurl = 0.45; thumbCurl = 0.35; thumbSpread = 0.30; spread = 0.02;
  } else if (preset === 'arm_heart') {
    curl = 0.25; midCurl = 0.45; distCurl = 0.25; thumbCurl = 0.20; thumbSpread = 0.20; spread = 0.02;
  } else if (preset === 'cup') {
    curl = 0.65; midCurl = 0.75; distCurl = 0.50; thumbCurl = 0.55; thumbSpread = 0.35; spread = 0.05;
  } else if (preset === 'pinch') {
    curl = 0.50; midCurl = 0.70; distCurl = 0.40; thumbCurl = 0.45; thumbSpread = 0.30; spread = 0.02;
  } else if (preset === 'phone') {
    curl = 0.60; midCurl = 0.70; distCurl = 0.45; thumbCurl = 0.25; thumbSpread = 0.20; spread = 0.04;
  } else if (preset === 'book') {
    curl = 0.15; midCurl = 0.20; distCurl = 0.10; thumbCurl = 0.30; thumbSpread = 0.25; spread = 0.05;
  } else if (preset === 'writing') {
    curl = 0.70; midCurl = 0.80; distCurl = 0.50; thumbCurl = 0.45; thumbSpread = 0.25; spread = 0.03;
  } else if (preset === 'shield_eyes') {
    curl = 0.05; midCurl = 0.05; distCurl = 0.02; thumbCurl = 0.25; thumbSpread = 0.10; spread = -0.03;
  } else if (preset === 'clasped') {
    curl = 0.55; midCurl = 0.65; distCurl = 0.45; thumbCurl = 0.40; thumbSpread = 0.25; spread = 0.02;
  }

  // Apply across 4 fingers (Index, Middle, Ring, Little)
  const fingers: ('Index' | 'Middle' | 'Ring' | 'Little')[] = ['Index', 'Middle', 'Ring', 'Little'];
  fingers.forEach((f, idx) => {
    const spreadAngle = (idx - 1.5) * spread * spreadSign;
    setBoneRot((isL ? `left${f}Proximal` : `right${f}Proximal`) as VRMHumanBoneName,       [0, spreadAngle, flexSign * curl]);
    setBoneRot((isL ? `left${f}Intermediate` : `right${f}Intermediate`) as VRMHumanBoneName, [0, 0, flexSign * midCurl]);
    setBoneRot((isL ? `left${f}Distal` : `right${f}Distal`) as VRMHumanBoneName,             [0, 0, flexSign * distCurl]);
  });

  // Thumb
  setBoneRot(isL ? 'leftThumbMetacarpal' : 'rightThumbMetacarpal', [0.15, spreadSign * thumbSpread, flexSign * thumbCurl * 0.6]);
  setBoneRot(isL ? 'leftThumbProximal' : 'rightThumbProximal',     [0.10, spreadSign * (thumbSpread * 0.5), flexSign * thumbCurl]);
  setBoneRot(isL ? 'leftThumbDistal' : 'rightThumbDistal',         [0, 0, flexSign * thumbCurl * 0.8]);
}

