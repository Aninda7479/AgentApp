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

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const d2r = (deg: number) => (deg * Math.PI) / 180;
type Vec3 = [number, number, number];
type Pose = { rot: Record<string, Vec3>; pos: Record<string, Vec3>; screen: number; laptopFallen: boolean };

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
  private joints: Record<string, THREE.Object3D> = {};
  private restPos: Record<string, THREE.Vector3> = {};
  private target: Record<string, Vec3> = {}; // jointName -> target euler
  private targetPos: Record<string, Vec3> = {}; // jointName -> target position (offset)
  private behavior: Behavior = 'idle';
  private expression: ExpressionName = 'neutral';
  private lipSync = false;
  private darkCircles = false;
  private pokePart: string | null = null;
  private pokeT = 0;
  // face parts
  private eyeL!: THREE.Mesh;
  private eyeR!: THREE.Mesh;
  private mouth!: THREE.Mesh;
  private darkL!: THREE.Mesh;
  private darkR!: THREE.Mesh;
  private eyeOpenTarget = 1;
  private eyeOpen = 1;
  private mouthOpenTarget = 0;
  private mouthOpen = 0;
  private darkVisTarget = 0;
  private darkVis = 0;
  // laptop / pillow
  private laptop!: THREE.Group;
  private laptopScreen!: THREE.Group;
  private pillow!: THREE.Group;
  private skinMat!: THREE.MeshStandardMaterial;
  private clothMat!: THREE.MeshStandardMaterial;
  private hairMat!: THREE.MeshStandardMaterial;

  constructor(accent: string) {
    this.build(accent);
    this.applyRest();
    this.setBehavior('idle');
  }

  playSound(freq: number, audioCtx: AudioContext | null) {
    if (!audioCtx) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.2);
    } catch { /* noop */ }
  }

  private makeMat(color: string, rough = 0.6, metal = 0.05) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: rough,
      metalness: metal,
      envMapIntensity: 1.1
    });
  }

  private build(accent: string) {
    this.skinMat = this.makeMat('#f6cdb0', 0.7);
    this.clothMat = this.makeMat(accent || '#ff8fb3', 0.8);
    this.hairMat = this.makeMat('#3a2b4d', 0.85);

    const g = this.object;

    // Pelvis (root of the body)
    const pelvis = new THREE.Group();
    g.add(pelvis);
    this.joints.pelvis = pelvis;

    // Torso
    const torso = new THREE.Group();
    torso.position.y = 0.1;
    pelvis.add(torso);
    this.joints.torso = torso;

    const chestGeo = new THREE.BoxGeometry(0.32, 0.42, 0.22);
    const chest = new THREE.Mesh(chestGeo, this.clothMat);
    chest.position.y = 0.21;
    chest.scale.set(1.1, 0.7, 0.5);
    torso.add(chest);

    // Head joint
    const neck = new THREE.Group();
    neck.position.y = 0.42;
    torso.add(neck);
    this.joints.head = neck;

    const headGeo = new THREE.BoxGeometry(0.28, 0.28, 0.26);
    const head = new THREE.Mesh(headGeo, this.skinMat);
    head.position.y = 0.14;
    neck.add(head);

    // Hair back
    const hbGeo = new THREE.BoxGeometry(0.3, 0.32, 0.1);
    const hairBack = new THREE.Mesh(hbGeo, this.hairMat);
    hairBack.position.set(0, 0.15, -0.1);
    hairBack.scale.set(1, 1.05, 0.8);
    neck.add(hairBack);

    // Hair bangs
    const hfGeo = new THREE.BoxGeometry(0.3, 0.08, 0.06);
    const hairBangs = new THREE.Mesh(hfGeo, this.hairMat);
    hairBangs.position.set(0, 0.27, 0.11);
    neck.add(hairBangs);

    // Face details
    const eyeGeo = new THREE.BoxGeometry(0.05, 0.05, 0.01);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x221133 });
    this.eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeL.position.set(-0.06, 0.14, 0.131);
    neck.add(this.eyeL);

    this.eyeR = this.eyeL.clone() as THREE.Mesh;
    this.eyeR.position.x = 0.06;
    neck.add(this.eyeR);

    // Dark circles (tired look)
    const darkGeo = new THREE.BoxGeometry(0.06, 0.015, 0.005);
    const darkMat = new THREE.MeshBasicMaterial({ color: 0x5a4d75, transparent: true, opacity: 0 });
    this.darkL = new THREE.Mesh(darkGeo, darkMat);
    this.darkL.position.set(-0.06, 0.09, 0.132);
    this.darkL.visible = false;
    this.darkL.scale.set(1.4, 0.7, 0.4);
    neck.add(this.darkL);

    this.darkR = this.darkL.clone() as THREE.Mesh;
    this.darkR.position.x = 0.06;
    neck.add(this.darkR);

    // Mouth
    const mouthGeo = new THREE.BoxGeometry(0.04, 0.015, 0.02);
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0xd95b76 });
    this.mouth = new THREE.Mesh(mouthGeo, mouthMat);
    this.mouth.position.set(0, -0.13, 0.131); // Relative to head center (Wait, head center is 0.14, so -0.13 means +0.01 on neck)
    this.mouth.scale.set(1, 1, 0.2);
    head.add(this.mouth);

    // Right Arm (ArmUR -> ArmER -> HandR)
    const armUR = new THREE.Group();
    armUR.position.set(0.18, 0.35, 0);
    torso.add(armUR);
    this.joints.armUR = armUR;

    const upperR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.09), this.clothMat);
    upperR.position.y = -0.11;
    armUR.add(upperR);

    const armER = new THREE.Group();
    armER.position.y = -0.22;
    armUR.add(armER);
    this.joints.armER = armER;

    const lowerR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), this.skinMat);
    lowerR.position.y = -0.1;
    armER.add(lowerR);

    const handR = new THREE.Group();
    handR.position.y = -0.2;
    armER.add(handR);
    this.joints.handR = handR;

    // Left Arm (ArmUL -> ArmEL -> HandL)
    const armUL = new THREE.Group();
    armUL.position.set(-0.18, 0.35, 0);
    torso.add(armUL);
    this.joints.armUL = armUL;

    const upperL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.09), this.clothMat);
    upperL.position.y = -0.11;
    armUL.add(upperL);

    const armEL = new THREE.Group();
    armEL.position.y = -0.22;
    armUL.add(armEL);
    this.joints.armEL = armEL;

    const lowerL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), this.skinMat);
    lowerL.position.y = -0.1;
    armEL.add(lowerL);

    const handL = new THREE.Group();
    handL.position.y = -0.2;
    armEL.add(handL);
    this.joints.handL = handL;

    // Legs
    const thighGeo = new THREE.BoxGeometry(0.12, 0.32, 0.12);
    const thighR = new THREE.Mesh(thighGeo, this.clothMat);
    thighR.position.set(0.08, -0.16, 0.1);
    pelvis.add(thighR);

    const thighL = thighR.clone();
    thighL.position.x = -0.08;
    pelvis.add(thighL);

    // Props: Laptop (base + screen)
    this.laptop = new THREE.Group();
    this.laptop.position.set(0, -0.16, 0.26);
    pelvis.add(this.laptop);
    this.joints.laptop = this.laptop;

    const lapBase = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.02, 0.26), this.makeMat('#2e2e38', 0.4, 0.3));
    this.laptop.add(lapBase);

    this.laptopScreen = new THREE.Group();
    this.laptopScreen.position.set(0, 0.01, -0.13);
    this.laptopScreen.rotation.x = d2r(100);
    this.laptop.add(this.laptopScreen);

    const screenLid = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.26, 0.015), this.makeMat('#2e2e38', 0.4, 0.3));
    screenLid.position.y = 0.13;
    this.laptopScreen.add(screenLid);

    const displayGeo = new THREE.PlaneGeometry(0.36, 0.24);
    const displayMat = new THREE.MeshBasicMaterial({ color: 0x334466 });
    const display = new THREE.Mesh(displayGeo, displayMat);
    display.position.set(0, 0.13, 0.009);
    this.laptopScreen.add(display);

    // Props: Pillow
    this.pillow = new THREE.Group();
    this.pillow.position.set(0.05, 0.4, -0.22);
    torso.add(this.pillow);
    this.joints.pillow = this.pillow;

    const pillowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.24), this.makeMat('#ffe8ed', 0.95));
    pillowMesh.rotation.set(d2r(15), d2r(-10), d2r(5));
    this.pillow.add(pillowMesh);

    // Tag parts for poke raycasting
    pelvis.userData = { part: 'pelvis' };
    torso.userData = { part: 'torso' };
    neck.userData = { part: 'head' };
    armUR.userData = { part: 'arm' };
    armUL.userData = { part: 'arm' };
  }

  private applyRest() {
    this.object.traverse((o) => {
      if (o instanceof THREE.Group && o.name) {
        this.restPos[o.name] = o.position.clone();
      }
    });
    // Hardcode fallback rest positions for joints that aren't named in the scene graph
    for (const name in this.joints) {
      this.restPos[name] = this.joints[name].position.clone();
    }
  }

  private poseFor(b: Behavior): Pose {
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
        // idle
        return {
          rot: base.rot,
          pos: base.pos,
          screen: d2r(100),
          laptopFallen: false
        };
    }
  }

  setBehavior(b: Behavior, opts?: { part?: string }): void {
    this.behavior = b;
    if (b === 'poke') {
      this.pokePart = opts?.part || 'body';
      this.pokeT = 0.6;
      this.setExpression('surprised');
      return;
    }
    const p = this.poseFor(b);
    this.target = p.rot;
    this.targetPos = p.pos;
    (this as any)._screenTarget = p.screen;
    (this as any)._laptopFallen = p.laptopFallen;
    this.setExpression(this.expressionFor(b));
  }

  private expressionFor(b: Behavior): ExpressionName {
    if (b === 'celebrate') return 'happy';
    if (b === 'sad') return 'sad';
    if (b === 'talking') return 'surprised';
    if (b === 'hello') return 'happy';
    if (b === 'sleeping' || b === 'laying') return 'neutral';
    return this.darkCircles ? 'angry' : 'neutral';
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
      this.setExpression(this.expressionFor(this.behavior));
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
    const k = clamp(dt * 8, 0, 1);
    // lerp joint rotations
    for (const name in this.target) {
      const j = this.joints[name];
      if (!j) continue;
      const [tx, ty, tz] = this.target[name];
      j.rotation.x = lerp(j.rotation.x, tx, k);
      j.rotation.y = lerp(j.rotation.y, ty, k);
      j.rotation.z = lerp(j.rotation.z, tz, k);
    }
    // lerp positions (pelvis/laptop/pillow)
    for (const name in this.targetPos) {
      const j = this.joints[name];
      const base = this.restPos[name];
      if (!j || !base) continue;
      const [tx, ty, tz] = this.targetPos[name];
      j.position.x = lerp(j.position.x, base.x + tx, k);
      j.position.y = lerp(j.position.y, base.y + ty, k);
      j.position.z = lerp(j.position.z, base.z + tz, k);
    }
    // laptop screen hinge
    const st = (this as any)._screenTarget ?? d2r(100);
    this.laptopScreen.rotation.x = lerp(this.laptopScreen.rotation.x, st, k);

    // continuous modulation
    const breathe = Math.sin(t * 1.6) * 0.012;
    this.joints.torso.position.y = lerp(this.joints.torso.position.y, 0.1 + breathe, k);

    if (this.behavior === 'working') {
      const jit = Math.sin(t * 14) * 0.06;
      this.joints.handL.rotation.x = lerp(this.joints.handL.rotation.x, jit, 0.5);
      this.joints.handR.rotation.x = lerp(this.joints.handR.rotation.x, -jit, 0.5);
      this.joints.head.rotation.z = lerp(this.joints.head.rotation.z, Math.sin(t * 2) * 0.02, 0.2);
    }
    if (this.behavior === 'walk') {
      const bob = Math.abs(Math.sin(t * 9)) * 0.03;
      this.joints.pelvis.position.y = lerp(this.joints.pelvis.position.y, this.restPos.pelvis.y - 0.05 + bob, 0.35);
      this.object.rotation.z = lerp(this.object.rotation.z, Math.sin(t * 6) * 0.025, 0.3);
    } else {
      this.object.rotation.z = lerp(this.object.rotation.z, 0, 0.2);
      this.object.rotation.y = lerp(this.object.rotation.y, 0, 0.2);
    }
    if (this.behavior === 'celebrate') {
      this.joints.pelvis.position.y = lerp(
        this.joints.pelvis.position.y,
        this.restPos.pelvis.y + Math.abs(Math.sin(t * 7)) * 0.2,
        0.4
      );
    }

    // Hello wave: oscillate the raised right forearm
    if (this.behavior === 'hello') {
      const w = Math.sin(t * 10) * 0.5;
      this.joints.armER.rotation.z = lerp(this.joints.armER.rotation.z, d2r(20) + w, 0.5);
      this.joints.handR.rotation.z = lerp(this.joints.handR.rotation.z, w, 0.5);
    }

    // poke decay
    if (this.pokeT > 0) {
      this.pokeT -= dt;
      const j = this.joints[this.pokePart || 'body'];
      if (j) {
        const n = Math.sin(this.pokeT * 30) * 0.15 * (this.pokeT / 0.6);
        j.position.x = (this.restPos[j.name] ? this.restPos[j.name].x : 0) + n;
      }
      if (this.pokeT <= 0) {
        this.pokePart = null;
      }
    }

    // face
    this.eyeOpen = lerp(this.eyeOpen, this.eyeOpenTarget, k);
    this.eyeL.scale.y = this.eyeOpen;
    this.eyeR.scale.y = this.eyeOpen;
    this.eyeL.scale.x = lerp(this.eyeL.scale.x, this.eyeOpen < 0.3 ? 1.6 : 1, k);
    this.eyeR.scale.x = lerp(this.eyeR.scale.x, this.eyeOpen < 0.3 ? 1.6 : 1, k);
    this.mouthOpen = lerp(
      this.mouthOpen,
      this.mouthOpenTarget + (this.lipSync ? Math.abs(Math.sin(t * 18)) * 0.8 : 0),
      0.5
    );
    this.mouth.scale.set(1, 1, this.mouthOpen * 3 + 0.2);
    this.mouth.position.y = lerp(this.mouth.position.y, -0.13 - this.mouthOpen * 0.02, 0.3);
    this.darkVis = lerp(this.darkVis, this.darkVisTarget, k);
    this.darkL.visible = this.darkVis > 0.02;
    this.darkR.visible = this.darkVis > 0.02;
    (this.darkL.material as THREE.MeshStandardMaterial).opacity = this.darkVis;
    (this.darkL.material as THREE.MeshStandardMaterial).transparent = true;
    (this.darkR.material as THREE.MeshStandardMaterial).opacity = this.darkVis;
    (this.darkR.material as THREE.MeshStandardMaterial).transparent = true;
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
