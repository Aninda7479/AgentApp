import { describe, it, expect } from 'vitest';
import {
  getIdlePose,
  getWavePose,
  getSalutePose,
  getDancePose,
  getStretchPose,
  getHeartPose,
  getPeacePose,
  getNekoPose,
  getBowPose,
  getCheerPose,
  getBlushPose,
  getLaughPose,
  getListenPose,
  getTalkingPose,
  getThinkingPose,
  ACTION_DURATIONS,
} from './animations';

describe('VRM Animations Module', () => {
  it('should generate valid idle pose with breathing and gaze coordinates', () => {
    const pose = getIdlePose(1.0, 0.2, -0.1);
    expect(pose).toBeDefined();
    expect(pose.headRot).toBeDefined();
    expect(pose.hipsPos).toBeDefined();
    expect(pose.leftFingers).toBe('relaxed');
    expect(pose.rightFingers).toBe('relaxed');
  });

  it('should generate valid wave pose with open right fingers', () => {
    const idle = getIdlePose(0, 0, 0);
    const wave = getWavePose(1.0, 0.5, idle);
    expect(wave.rightFingers).toBe('open');
    expect(wave.rightLowerArmRot).toBeDefined();
    expect(wave.expressions?.happy).toBeGreaterThan(0.5);
  });

  it('should generate valid heart pose with heart finger preset', () => {
    const idle = getIdlePose(0, 0, 0);
    const heart = getHeartPose(1.0, 0.5, idle);
    expect(heart.leftFingers).toBe('heart');
    expect(heart.rightFingers).toBe('heart');
    expect(heart.expressions?.happy).toBe(1.0);
  });

  it('should generate valid peace pose with peace fingers', () => {
    const idle = getIdlePose(0, 0, 0);
    const peace = getPeacePose(1.0, 0.5, idle);
    expect(peace.rightFingers).toBe('peace');
  });

  it('should generate valid cheer pose with fist fingers', () => {
    const idle = getIdlePose(0, 0, 0);
    const cheer = getCheerPose(1.0, 0.5, idle);
    expect(cheer.leftFingers).toBe('fist');
    expect(cheer.rightFingers).toBe('fist');
  });

  it('should generate valid blush, laugh, and listen poses', () => {
    const idle = getIdlePose(0, 0, 0);
    const blush = getBlushPose(1.0, 0.5, idle);
    expect(blush.expressions?.relaxed).toBeDefined();

    const laugh = getLaughPose(1.0, 0.5, idle);
    expect(laugh.expressions?.happy).toBe(1.0);

    const listen = getListenPose(1.0, 0.5, idle);
    expect(listen.spineRot?.[0]).toBeGreaterThan(0.05);
  });

  it('should have standard action durations defined for finite clips', () => {
    expect(ACTION_DURATIONS.wave).toBe(4.5);
    expect(ACTION_DURATIONS.salute).toBe(4.0);
    expect(ACTION_DURATIONS.stretch).toBe(6.0);
    expect(ACTION_DURATIONS.bow).toBe(3.2);
    expect(ACTION_DURATIONS.blush).toBe(4.5);
  });
});
