import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { FingerPreset } from './types';

/**
 * Apply all 15 finger bones per hand based on finger preset
 */
export function applyFingerPreset(
  vrm: VRM,
  side: 'left' | 'right',
  preset: FingerPreset = 'relaxed'
): void {
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

  // Apply general preset across all 4 non-thumb fingers (12 joints)
  const fingers: ('Index' | 'Middle' | 'Ring' | 'Little')[] = ['Index', 'Middle', 'Ring', 'Little'];
  fingers.forEach((f, idx) => {
    const spreadAngle = (idx - 1.5) * spread * sign;
    setBoneRot((isL ? `left${f}Proximal` : `right${f}Proximal`) as VRMHumanBoneName, [0, spreadAngle, sign * curl]);
    setBoneRot((isL ? `left${f}Intermediate` : `right${f}Intermediate`) as VRMHumanBoneName, [0, 0, sign * midCurl]);
    setBoneRot((isL ? `left${f}Distal` : `right${f}Distal`) as VRMHumanBoneName, [0, 0, sign * distCurl]);
  });

  // Thumb (3 joints)
  setBoneRot(isL ? 'leftThumbMetacarpal' : 'rightThumbMetacarpal', [0, 0.25 * sign, sign * thumbCurl * 0.5]);
  setBoneRot(isL ? 'leftThumbProximal' : 'rightThumbProximal',     [0, 0.15 * sign, sign * thumbCurl]);
  setBoneRot(isL ? 'leftThumbDistal' : 'rightThumbDistal',         [0, 0, sign * thumbCurl * 0.8]);
}
