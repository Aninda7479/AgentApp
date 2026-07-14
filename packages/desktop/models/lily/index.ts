import * as THREE from 'three';
import {
  Behavior,
  ExpressionName,
  Pose,
  Vec3,
  poseFor,
  expressionFor,
  updateAnimations
} from './animations';
import { buildLilyGeometry, applyLilyRest, makeMat } from './model';
import { playSound } from './audio';

export { Behavior, ExpressionName, Pose, Vec3 };

export const name = 'Lily';
export const desc = 'A cute anime girl in a red dress who works, sleeps, and keeps you company.';
export const type = 'girl'; // Supports Boy/Girl/Pet
export const dp = '🧍'; // Supports emoji or image file path (relative to partner folder)

export interface Character {
  object: THREE.Object3D;
  setBehavior(b: Behavior, opts?: { part?: string }): void;
  setExpression(e: ExpressionName): void;
  setLipSync(on: boolean): void;
  setDarkCircles(on: boolean): void;
  setScale(s: number): void;
  update(dt: number, t: number): void;
  raycastPart(ndc: THREE.Vector2, camera: THREE.Camera): string | null;
  dispose(): void;
  playSound?(freq: number, audioCtx: AudioContext | null): void;
}

export class Lily implements Character {
  object = new THREE.Group();
  
  // Publicly exposed fields accessed by model / animation runners
  joints: Record<string, THREE.Object3D> = {};
  restPos: Record<string, THREE.Vector3> = {};
  target: Record<string, Vec3> = {}; // jointName -> target euler
  targetPos: Record<string, Vec3> = {}; // jointName -> target position (offset)
  behavior: Behavior = 'idle';
  expression: ExpressionName = 'neutral';
  lipSync = false;
  darkCircles = false;
  pokePart: string | null = null;
  pokeT = 0;
  
  // Face parts
  eyeL!: THREE.Mesh;
  eyeR!: THREE.Mesh;
  mouth!: THREE.Mesh;
  darkL!: THREE.Mesh;
  darkR!: THREE.Mesh;
  eyeOpenTarget = 1;
  eyeOpen = 1;
  mouthOpenTarget = 0;
  mouthOpen = 0;
  darkVisTarget = 0;
  darkVis = 0;
  
  // Laptop / pillow
  laptop!: THREE.Group;
  laptopScreen!: THREE.Group;
  pillow!: THREE.Group;
  skinMat!: THREE.MeshStandardMaterial;
  clothMat!: THREE.MeshStandardMaterial;
  hairMat!: THREE.MeshStandardMaterial;

  constructor(accent: string) {
    buildLilyGeometry(this, accent);
    applyLilyRest(this);
    this.setBehavior('idle');
  }

  playSound(freq: number, audioCtx: AudioContext | null) {
    playSound(freq, audioCtx);
  }

  setBehavior(b: Behavior, opts?: { part?: string }): void {
    this.behavior = b;
    if (b === 'poke') {
      this.pokePart = opts?.part || 'body';
      this.pokeT = 0.6;
      this.setExpression('surprised');
      return;
    }
    const p = poseFor(b);
    this.target = p.rot;
    this.targetPos = p.pos;
    (this as any)._screenTarget = p.screen;
    (this as any)._laptopFallen = p.laptopFallen;
    this.setExpression(expressionFor(b, this.darkCircles));
  }

  setExpression(e: ExpressionName): void {
    this.expression = e;
    switch (e) {
      case 'happy':
        this.eyeOpenTarget = 0.5;
        this.mouthOpenTarget = 0.3;
        break;
      case 'surprised':
        this.eyeOpenTarget = 1.3;
        this.mouthOpenTarget = 1;
        break;
      case 'sad':
        this.eyeOpenTarget = 0.8;
        this.mouthOpenTarget = 0;
        break;
      case 'angry':
        this.eyeOpenTarget = 0.9;
        this.mouthOpenTarget = 0;
        break;
      default:
        this.eyeOpenTarget = 1;
        this.mouthOpenTarget = 0;
        break;
    }
    if (this.behavior === 'sleeping' || this.behavior === 'laying') this.eyeOpenTarget = 0.08;
  }

  setLipSync(on: boolean): void {
    this.lipSync = on;
  }

  setDarkCircles(on: boolean): void {
    this.darkCircles = on;
    this.darkVisTarget = on ? 1 : 0;
    if (this.behavior !== 'sleeping' && this.behavior !== 'laying') {
      this.setExpression(expressionFor(this.behavior, this.darkCircles));
    }
  }

  setScale(s: number): void {
    this.object.scale.setScalar(s);
  }

  raycastPart(ndc: THREE.Vector2, cam: THREE.Camera): string | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cam as THREE.PerspectiveCamera);
    const hits = ray.intersectObject(this.object, true);
    for (const h of hits) {
      let o: any = h.object;
      while (o) {
        if (o.userData && o.userData.part) return o.userData.part as string;
        o = o.parent;
      }
    }
    return null;
  }

  update(dt: number, t: number): void {
    updateAnimations(this, dt, t);
  }

  dispose(): void {
    this.object.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        const m = o.material;
        Array.isArray(m) ? m.forEach((x) => x.dispose?.()) : m.dispose?.();
      }
    });
  }
}
