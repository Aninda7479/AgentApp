import * as THREE from 'three';

export type Behavior =
  | 'working'
  | 'idle'
  | 'sleeping'
  | 'laying'
  | 'walk'
  | 'poke'
  | 'celebrate'
  | 'talking'
  | 'sad'
  | 'hello';

export type ExpressionName = 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry';

export const d2r = (deg: number) => (deg * Math.PI) / 180;
export type Vec3 = [number, number, number];
export type Pose = { rot: Record<string, Vec3>; pos: Record<string, Vec3>; screen: number; laptopFallen: boolean };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function poseFor(b: Behavior): Pose {
  const Z = d2r(0);
  const base = {
    rot: {
      pelvis: [0, 0, 0],
      torso: [0, 0, 0],
      head: [0, 0, 0],
      armUR: [0, 0, 0],
      armER: [0, 0, 0],
      handR: [0, 0, 0],
      armUL: [0, 0, 0],
      armEL: [0, 0, 0],
      handL: [0, 0, 0]
    } as Record<string, Vec3>,
    pos: {
      pelvis: [0, 0, 0],
      laptop: [0, 0, 0],
      pillow: [0, 0, 0]
    } as Record<string, Vec3>,
    screen: d2r(100),
    laptopFallen: false
  };

  switch (b) {
    case 'working':
      return {
        rot: {
          ...base.rot,
          torso: [d2r(6), 0, 0],
          head: [d2r(10), 0, 0],
          armUR: [d2r(-12), d2r(-10), d2r(-15)],
          armER: [d2r(75), d2r(-10), d2r(-45)],
          armUL: [d2r(-12), d2r(10), d2r(15)],
          armEL: [d2r(75), d2r(10), d2r(45)]
        },
        pos: base.pos,
        screen: d2r(105),
        laptopFallen: false
      };
    case 'sleeping':
      return {
        rot: {
          ...base.rot,
          torso: [d2r(-12), d2r(8), d2r(-15)],
          head: [d2r(18), d2r(-15), d2r(-12)],
          armUR: [d2r(15), 0, d2r(-8)],
          armER: [d2r(25), 0, 0],
          armUL: [d2r(10), 0, d2r(10)],
          armEL: [d2r(20), 0, 0]
        },
        pos: {
          pelvis: [0, -0.06, -0.05],
          laptop: [0.08, -0.08, 0.16],
          pillow: [-0.05, -0.15, -0.02]
        },
        screen: d2r(10),
        laptopFallen: true
      };
    case 'laying':
      return {
        rot: {
          ...base.rot,
          torso: [d2r(8), d2r(18), d2r(-32)],
          head: [d2r(15), d2r(-18), d2r(-8)],
          armUR: [d2r(35), 0, d2r(-15)],
          armER: [d2r(45), 0, 0],
          armUL: [d2r(25), 0, d2r(20)],
          armEL: [d2r(35), 0, 0]
        },
        pos: {
          pelvis: [0, -0.22, 0.08],
          laptop: [-0.15, 0.04, 0.22],
          pillow: [-0.08, -0.22, 0.08]
        },
        screen: d2r(5),
        laptopFallen: true
      };
    case 'walk':
      return {
        rot: {
          ...base.rot,
          torso: [d2r(-4), 0, 0],
          head: [0, 0, 0],
          armUR: [d2r(4), 0, d2r(-42)],
          armER: [d2r(88), 0, d2r(-55)],
          armUL: [d2r(4), 0, d2r(42)],
          armEL: [d2r(88), 0, d2r(55)]
        },
        pos: {
          pelvis: [0, 0.18, -0.05],
          laptop: [0, 0.28, 0.16],
          pillow: [0, 0, -0.8] // hide pillow
        },
        screen: d2r(25),
        laptopFallen: false
      };
    case 'celebrate':
      return {
        rot: {
          ...base.rot,
          torso: [d2r(-8), 0, 0],
          head: [d2r(-12), 0, 0],
          armUR: [0, 0, d2r(-145)],
          armER: [d2r(15), 0, 0],
          armUL: [0, 0, d2r(145)],
          armEL: [d2r(15), 0, 0]
        },
        pos: {
          ...base.pos,
          laptop: [0, -0.16, 0.32],
          pillow: [0, 0, -0.8] // hide pillow
        },
        screen: d2r(80),
        laptopFallen: false
      };
    case 'sad':
      return {
        rot: {
          ...base.rot,
          torso: [d2r(14), 0, 0],
          head: [d2r(22), 0, 0],
          armUR: [d2r(10), 0, d2r(-15)],
          armER: [d2r(85), 0, d2r(-55)],
          armUL: [d2r(10), 0, d2r(15)],
          armEL: [d2r(85), 0, d2r(55)]
        },
        pos: base.pos,
        screen: d2r(60),
        laptopFallen: false
      };
    case 'talking':
      return {
        rot: {
          ...base.rot,
          torso: [d2r(4), 0, 0],
          head: [d2r(-8), 0, 0],
          armUR: [d2r(-10), 0, d2r(-18)],
          armER: [d2r(78), 0, d2r(-42)],
          armUL: [d2r(-8), 0, d2r(24)]
        },
        pos: base.pos,
        screen: d2r(100),
        laptopFallen: false
      };
    case 'hello':
      return {
        rot: {
          ...base.rot,
          torso: [d2r(-4), 0, 0],
          head: [d2r(-8), 0, 0],
          armUR: [0, 0, d2r(-150)],
          armER: [d2r(20), 0, 0],
          handR: [0, 0, 0]
        },
        pos: base.pos,
        screen: d2r(100),
        laptopFallen: false
      };
    default:
      return {
        rot: base.rot,
        pos: base.pos,
        screen: base.screen,
        laptopFallen: base.laptopFallen
      };
  }
}

export function expressionFor(b: Behavior, darkCircles: boolean): ExpressionName {
  if (b === 'celebrate') return 'happy';
  if (b === 'sad') return 'sad';
  if (b === 'talking') return 'surprised';
  if (b === 'hello') return 'happy';
  if (b === 'sleeping' || b === 'laying') return 'neutral';
  return darkCircles ? 'angry' : 'neutral';
}

export function updateAnimations(lily: any, dt: number, t: number): void {
  const k = clamp(dt * 8, 0, 1);
  
  // lerp joint rotations
  for (const name in lily.target) {
    const j = lily.joints[name];
    if (!j) continue;
    const [tx, ty, tz] = lily.target[name];
    j.rotation.x = lerp(j.rotation.x, tx, k);
    j.rotation.y = lerp(j.rotation.y, ty, k);
    j.rotation.z = lerp(j.rotation.z, tz, k);
  }
  
  // lerp positions
  for (const name in lily.targetPos) {
    const j = lily.joints[name];
    const base = lily.restPos[name];
    if (!j || !base) continue;
    const [tx, ty, tz] = lily.targetPos[name];
    j.position.x = lerp(j.position.x, base.x + tx, k);
    j.position.y = lerp(j.position.y, base.y + ty, k);
    j.position.z = lerp(j.position.z, base.z + tz, k);
  }
  
  // laptop screen hinge
  const st = lily._screenTarget ?? d2r(100);
  lily.laptopScreen.rotation.x = lerp(lily.laptopScreen.rotation.x, st, k);

  // continuous modulation
  const breathe = Math.sin(t * 1.6) * 0.012;
  lily.joints.torso.position.y = lerp(lily.joints.torso.position.y, 0.1 + breathe, k);

  if (lily.behavior === 'working') {
    const jit = Math.sin(t * 14) * 0.06;
    lily.joints.handL.rotation.x = lerp(lily.joints.handL.rotation.x, jit, 0.5);
    lily.joints.handR.rotation.x = lerp(lily.joints.handR.rotation.x, -jit, 0.5);
    lily.joints.head.rotation.z = lerp(lily.joints.head.rotation.z, Math.sin(t * 2) * 0.02, 0.2);
  }
  
  if (lily.behavior === 'walk') {
    const bob = Math.abs(Math.sin(t * 9)) * 0.03;
    lily.joints.pelvis.position.y = lerp(lily.joints.pelvis.position.y, lily.restPos.pelvis.y - 0.05 + bob, 0.35);
    lily.object.rotation.z = lerp(lily.object.rotation.z, Math.sin(t * 6) * 0.025, 0.3);
  } else {
    lily.object.rotation.z = lerp(lily.object.rotation.z, 0, 0.2);
    lily.object.rotation.y = lerp(lily.object.rotation.y, 0, 0.2);
  }
  
  if (lily.behavior === 'celebrate') {
    lily.joints.pelvis.position.y = lerp(
      lily.joints.pelvis.position.y,
      lily.restPos.pelvis.y + Math.abs(Math.sin(t * 7)) * 0.2,
      0.4
    );
  }

  // Hello wave
  if (lily.behavior === 'hello') {
    const w = Math.sin(t * 10) * 0.5;
    lily.joints.armER.rotation.z = lerp(lily.joints.armER.rotation.z, d2r(20) + w, 0.5);
    lily.joints.handR.rotation.z = lerp(lily.joints.handR.rotation.z, w, 0.5);
  }

  // poke decay
  if (lily.pokeT > 0) {
    lily.pokeT -= dt;
    const j = lily.joints[lily.pokePart || 'body'];
    if (j) {
      const n = Math.sin(lily.pokeT * 30) * 0.15 * (lily.pokeT / 0.6);
      j.position.x = (lily.restPos[j.name] ? lily.restPos[j.name].x : 0) + n;
    }
    if (lily.pokeT <= 0) {
      lily.pokePart = null;
    }
  }

  // face
  lily.eyeOpen = lerp(lily.eyeOpen, lily.eyeOpenTarget, k);
  lily.eyeL.scale.y = lily.eyeOpen;
  lily.eyeR.scale.y = lily.eyeOpen;
  lily.eyeL.scale.x = lerp(lily.eyeL.scale.x, lily.eyeOpen < 0.3 ? 1.6 : 1, k);
  lily.eyeR.scale.x = lerp(lily.eyeR.scale.x, lily.eyeOpen < 0.3 ? 1.6 : 1, k);
  
  lily.mouthOpen = lerp(
    lily.mouthOpen,
    lily.mouthOpenTarget + (lily.lipSync ? Math.abs(Math.sin(t * 18)) * 0.8 : 0),
    0.5
  );
  lily.mouth.scale.set(1, 1, lily.mouthOpen * 3 + 0.2);
  lily.mouth.position.y = lerp(lily.mouth.position.y, -0.13 - lily.mouthOpen * 0.02, 0.3);
  
  lily.darkVis = lerp(lily.darkVis, lily.darkVisTarget, k);
  lily.darkL.visible = lily.darkVis > 0.02;
  lily.darkR.visible = lily.darkVis > 0.02;
  (lily.darkL.material as THREE.MeshStandardMaterial).opacity = lily.darkVis;
  (lily.darkL.material as THREE.MeshStandardMaterial).transparent = true;
  (lily.darkR.material as THREE.MeshStandardMaterial).opacity = lily.darkVis;
  (lily.darkR.material as THREE.MeshStandardMaterial).transparent = true;
}
