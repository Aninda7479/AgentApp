import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Lily } from '../models/lily/index';

describe('Lily 3D model (anime girl)', () => {
  const make = () => new Lily('#ff8fb3');

  it('builds with the required joint hierarchy intact', () => {
    const l = make();
    for (const j of [
      'pelvis', 'torso', 'head',
      'armUR', 'armER', 'handR',
      'armUL', 'armEL', 'handL',
      'laptop', 'pillow'
    ]) {
      expect(l.joints[j], `missing joint ${j}`).toBeTruthy();
    }
  });

  it('exposes the facial feature parts the animation system drives', () => {
    const l = make();
    expect(l.eyeL).toBeInstanceOf(THREE.Object3D);
    expect(l.eyeR).toBeInstanceOf(THREE.Object3D);
    expect(l.mouth).toBeInstanceOf(THREE.Object3D);
    expect(l.darkL).toBeInstanceOf(THREE.Object3D);
    expect(l.darkR).toBeInstanceOf(THREE.Object3D);
    // eyes should be in front of the face, not buried inside the head
    expect(l.eyeL.position.z).toBeGreaterThan(0.1);
  });

  it('runs every behavior + expression without throwing and keeps finite transforms', () => {
    const l = make();
    const behaviors = ['working', 'idle', 'sleeping', 'laying', 'walk', 'celebrate', 'talking', 'sad', 'hello', 'poke'] as const;
    for (const b of behaviors) {
      l.setBehavior(b as any);
      for (let i = 0; i < 30; i++) l.update(0.016, i * 0.016);
    }
    l.setExpression('surprised');
    for (const b of behaviors) {
      l.setBehavior(b as any);
      l.update(0.016, 5);
    }
    // traverse and ensure no NaN positions/rotations slipped in
    let ok = true;
    l.object.traverse((o: any) => {
      const p = o.position, r = o.rotation, s = o.scale;
      if ([p.x, p.y, p.z, r.x, r.y, r.z, s.x, s.y, s.z].some((v) => Number.isNaN(v))) ok = false;
    });
    expect(ok).toBe(true);
  });

  it('closes the eyes when sleeping', () => {
    const l = make();
    l.setBehavior('sleeping');
    for (let i = 0; i < 60; i++) l.update(0.05, i * 0.05);
    expect(l.eyeOpen).toBeLessThan(0.2);
  });

  it('tags body parts for poke raycasting', () => {
    const l = make();
    const hit = (o: any): string | null => {
      while (o) { if (o.userData?.part) return o.userData.part; o = o.parent; }
      return null;
    };
    expect(hit(l.joints.pelvis)).toBe('pelvis');
    expect(hit(l.joints.torso)).toBe('torso');
    expect(hit(l.joints.head)).toBe('head');
    expect(hit(l.joints.armUR)).toBe('arm');
  });
});
