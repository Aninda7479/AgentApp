import { describe, it, expect, vi } from 'vitest';
import {
  getIdlePose,
  getIdleRelaxedPose,
  getIdleBehindBackPose,
  getIdleHipsPose,
  getIdleArmsCrossedPose,
  getIdleWaitingPose,
  getIdleSittingChairPose,
  getIdleSittingFloorPose,
  getIdleStretchingPose,
  getIdleSleepyPose,
  getIdleCuriousPose,
  getWavePose,
  getWaveEnergeticPose,
  getWaveShyPose,
  getBowPose,
  getNodCasualPose,
  getAirHugPose,
  getKissGreetingPose,
  getGoodMorningPose,
  getGoodbyeWavePose,
  getGoodbyeReluctantPose,
  getKissGoodbyePose,
  getKissSinglePose,
  getKissTwoHandedPose,
  getFingerHeartPose,
  getHeartPose,
  getArmHeartBigPose,
  getAirCuddlesPose,
  getBlushPose,
  getWinkSmilePose,
  getHairFlipPose,
  getLeanInPose,
  getLovingGazePose,
  getLipBitePose,
  getBeckonPose,
  getTraceHeartPose,
  getPeekFingersPose,
  getTwirlHairPose,
  getLovingSighPose,
  getClapPose,
  getJumpJoyPose,
  getSpinPose,
  getFistPumpPose,
  getLaughPose,
  getLaughFullPose,
  getDancePose,
  getThumbsUpDoublePose,
  getThumbsUpSinglePose,
  getSparklyEyesPose,
  getHighFivePose,
  getPeacePose,
  getCheerPose,
  getSalutePose,
  getStretchPose,
  getListenPose,
  getTalkingPose,
  getThinkingPose,
  resolveActionPose,
  applyFingerPreset,
  ACTION_DURATIONS,
  type CompanionAction,
} from './animations';
import { ALL_ANIMATION_OPTIONS } from './AnimationsPanel';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

describe('VRM Animations & Kinematics Module', () => {
  it('should generate valid idle pose with breathing and gaze coordinates', () => {
    const pose = getIdlePose(1.0, 0.2, -0.1);
    expect(pose).toBeDefined();
    expect(pose.headRot).toBeDefined();
    expect(pose.hipsPos).toBeDefined();
    expect(pose.leftFingers).toBe('relaxed');
    expect(pose.rightFingers).toBe('relaxed');
  });

  it('should have exactly 125 total animation options in the catalog', () => {
    expect(ALL_ANIMATION_OPTIONS.length).toBe(125);
  });

  it('should generate valid poses for all 125 actions via resolveActionPose', () => {
    const baseIdle = getIdlePose(0, 0, 0);
    ALL_ANIMATION_OPTIONS.forEach(anim => {
      const pose = resolveActionPose(anim.id, 1.0, 0.5, baseIdle);
      expect(pose, `Action ${anim.id} failed to resolve`).toBeDefined();
      expect(pose.headRot).toBeDefined();
    });
  });

  it('should generate valid wave poses with correct finger presets and expressions', () => {
    const idle = getIdlePose(0, 0, 0);
    const wave = getWavePose(1.0, 0.5, idle);
    expect(wave.rightFingers).toBe('open');
    expect(wave.rightLowerArmRot).toBeDefined();
    expect(wave.expressions?.happy).toBeGreaterThan(0.5);

    const energetic = getWaveEnergeticPose(1.0, 0.5, idle);
    expect(energetic.hipsPos?.[1]).toBeGreaterThanOrEqual(0);
    expect(energetic.leftFingers).toBe('open');

    const shy = getWaveShyPose(1.0, 0.5, idle);
    expect(shy.rightFingers).toBe('open');
    expect(shy.expressions?.relaxed).toBeDefined();
  });

  it('should generate valid romantic & affection poses including Korean finger heart and chest heart', () => {
    const idle = getIdlePose(0, 0, 0);
    const fHeart = getFingerHeartPose(1.0, 0.5, idle);
    expect(fHeart.rightFingers).toBe('finger_heart');
    expect(fHeart.expressions?.happy).toBeGreaterThan(0.8);

    const heart = getHeartPose(1.0, 0.5, idle);
    expect(heart.leftFingers).toBe('heart');
    expect(heart.rightFingers).toBe('heart');
    expect(heart.leftUpperArmRot?.[0]).toBeGreaterThan(0.3); // forward elevated
    expect(heart.expressions?.happy).toBe(1.0);

    const armHeart = getArmHeartBigPose(1.0, 0.5, idle);
    expect(armHeart.leftFingers).toBe('arm_heart');
    expect(armHeart.rightFingers).toBe('arm_heart');
    expect(armHeart.leftUpperArmRot?.[2]).toBeGreaterThan(2.0); // overhead reach
  });

  it('should generate valid thumbs up and peace poses with specialized finger presets', () => {
    const idle = getIdlePose(0, 0, 0);
    const thumbs = getThumbsUpDoublePose(1.0, 0.5, idle);
    expect(thumbs.leftFingers).toBe('thumbs_up');
    expect(thumbs.rightFingers).toBe('thumbs_up');

    const peace = getPeacePose(1.0, 0.5, idle);
    expect(peace.rightFingers).toBe('peace');
  });

  it('should generate seated postures with correct lowered hips and bent knee kinematics', () => {
    const idle = getIdlePose(0, 0, 0);
    const chair = getIdleSittingChairPose(1.0, idle);
    expect(chair.hipsPos?.[1]).toBeLessThan(-0.3);
    expect(chair.leftUpperLegRot?.[0]).toBeLessThan(-1.0); // thighs horizontal
    expect(chair.leftLowerLegRot?.[0]).toBeGreaterThan(1.0); // 90 deg knees

    const floor = getIdleSittingFloorPose(1.0, idle);
    expect(floor.hipsPos?.[1]).toBeLessThan(-0.6);
  });

  it('should correctly apply anatomical finger signs (Left flexion -Z, Right flexion +Z)', () => {
    const mockBones: Record<string, { rotation: { set: (x: number, y: number, z: number) => void; x: number; y: number; z: number } }> = {};

    const mockVRM = {
      humanoid: {
        getNormalizedBoneNode: (name: VRMHumanBoneName) => {
          if (!mockBones[name]) {
            const rot = {
              x: 0,
              y: 0,
              z: 0,
              set(x: number, y: number, z: number) {
                this.x = x;
                this.y = y;
                this.z = z;
              },
            };
            mockBones[name] = { rotation: rot };
          }
          return mockBones[name] as any;
        },
      },
    } as unknown as VRM;

    // Apply fist to Left hand
    applyFingerPreset(mockVRM, 'left', 'fist');
    const leftIndexDistal = mockBones['leftIndexDistal'];
    expect(leftIndexDistal).toBeDefined();
    // Flexion on Left MUST be negative Z (inward curl into palm)
    expect(leftIndexDistal.rotation.z).toBeLessThan(0);

    // Apply fist to Right hand
    applyFingerPreset(mockVRM, 'right', 'fist');
    const rightIndexDistal = mockBones['rightIndexDistal'];
    expect(rightIndexDistal).toBeDefined();
    // Flexion on Right MUST be positive Z (inward curl into palm)
    expect(rightIndexDistal.rotation.z).toBeGreaterThan(0);
  });

  it('should have standard action durations defined for finite clips', () => {
    expect(ACTION_DURATIONS.wave).toBe(4.5);
    expect(ACTION_DURATIONS.bow).toBe(3.2);
    expect(ACTION_DURATIONS.finger_heart).toBe(5.0);
    expect(ACTION_DURATIONS.heart).toBe(5.0);
    expect(ACTION_DURATIONS.arm_heart_big).toBe(5.0);
    expect(ACTION_DURATIONS.thumbs_up_double).toBe(4.0);
    expect(ACTION_DURATIONS.react_headpat).toBe(4.5);
    expect(ACTION_DURATIONS.routine_phone).toBe(6.0);
  });
});
