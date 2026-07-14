/**
 * Three.js renderer + behavior engine for the free-roaming 3D Partner.
 *
 * This is the "anime-waifu" pet: a cute character that sits with a laptop and a
 * head pillow, and reacts to the agent through a small behavior state machine:
 *
 *   working   – typing on the laptop
 *   idle      – sitting, laptop on lap
 *   sleeping  – head on pillow, laptop fallen (idle > 10 min)
 *   laying    – curled up, laptop fallen (idle > 30 min)
 *   walk      – standing, holding the laptop, hopping (right-drag)
 *   poke      – startled recoil on the clicked body part (left-click)
 *   celebrate – hurray (agent finished)
 *   talking   – surprised face + lip-sync + speech bubble (agent needs input)
 *   sad       – sulking (agent errored / aborted)
 *
 * Two character implementations share one interface:
 *   • ProceduralWaifu – built from Three.js primitives, no asset required.
 *     This is what shows by default and is fully interactive immediately.
 *   • VRMCharacter – loads a VRoid-exported `.vrm` (three-vrm) for a real anime
 *     girl with native facial expressions (talking lip-sync, dark circles…).
 *     Drop a `character.vrm` into the Partner folder to upgrade.
 *
 * The pet window is transparent + always-on-top. Right-drag moves it (and makes
 * the character walk); left-click pokes a body part; the bottom-right grip
 * resizes the window and the character auto-scales to fill it.
 *
 * Plain TypeScript (no React) to keep the overlay light.
 */
import * as THREE from 'three';

// ── Types ───────────────────────────────────────────────────────────────────
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

interface Character {
  object: THREE.Object3D;
  setBehavior(b: Behavior, opts?: { part?: string }): void;
  setExpression(e: ExpressionName): void;
  setLipSync(on: boolean): void;
  setDarkCircles(on: boolean): void;
  setScale(s: number): void;
  update(dt: number, t: number): void;
  raycastPart(ndc: THREE.Vector2, camera: THREE.Camera): string | null;
  dispose(): void;
}

interface PartnerPayload {
  name?: string;
  kind?: string;
  accent?: string;
  emoji?: string;
  model?: string;
  modelPath?: string | null;
  vrm?: string;
  vrmPath?: string | null;
  laptop?: boolean;
  pillow?: boolean;
  dialogues?: Record<string, string>;
  animations?: Record<string, string>;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const d2r = (deg: number) => (deg * Math.PI) / 180;
type Vec3 = [number, number, number];
type Pose = { rot: Record<string, Vec3>; pos: Record<string, Vec3>; screen: number; laptopFallen: boolean };

// ── Electron IPC ──────────────────────────────────────────────────────────────
const electron = (window as any).require('electron');
const ipc = electron.ipcRenderer;
const nodeUrl = (window as any).require('url');

const canvas = document.getElementById('pet-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Filmic tone mapping + soft shadow maps give the character a grounded, less
// "plastic" look than raw linear output.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0, 0.45, 4.3);
camera.lookAt(0, 0.35, 0);

// Direct lights. Ambient is intentionally low — once the image-based
// environment (below) resolves it provides the soft fill; until then these
// carry the scene so the pet is never unlit.
const ambient = new THREE.AmbientLight(0xffffff, 0.28);
scene.add(ambient);
const key = new THREE.DirectionalLight(0xffffff, 1.35);
key.position.set(2.5, 4, 3.5);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 20;
key.shadow.camera.left = -3;
key.shadow.camera.right = 3;
key.shadow.camera.top = 3;
key.shadow.camera.bottom = -3;
key.shadow.bias = -0.0004;
key.shadow.radius = 4;
scene.add(key);
const rim = new THREE.DirectionalLight(0x88aaff, 0.45);
rim.position.set(-3, 1, -2);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xffd9ec, 0.22);
fill.position.set(0, 1, 3);
scene.add(fill);

// Soft contact shadow: a plane that is invisible except where the key light's
// shadow falls, grounding the character on the transparent desktop. Its height
// is aligned to the character's feet whenever a character is (re)built/resized.
const groundShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(24, 24),
  new THREE.ShadowMaterial({ opacity: 0.28 })
);
groundShadow.rotation.x = -Math.PI / 2;
groundShadow.receiveShadow = true;
groundShadow.position.y = -1.1;
scene.add(groundShadow);

// Image-based lighting from a neutral studio room: drives realistic reflections
// and soft fill on every PBR material. Loaded async so boot never blocks; if the
// module is unavailable the direct lights above still light the scene.
void (async () => {
  try {
    const envMod: any = await import('three/examples/jsm/environments/RoomEnvironment.js');
    const RoomEnvironment = envMod.RoomEnvironment;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();
  } catch (err) {
    console.error('[pet] environment map unavailable, using direct lights only', err);
  }
})();

// ============================================================ ProceduralWaifu
// A stylized, fully-posable figure made of primitives. All joints are separate
// groups so behaviors can rotate them and the poke raycast can identify parts.
class ProceduralWaifu implements Character {
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

  private makeMat(color: string, rough = 0.6, metal = 0.05) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: rough,
      metalness: metal,
      // Let the studio environment map read clearly for a softer, more lifelike
      // shading than flat directional light alone.
      envMapIntensity: 1.1
    });
  }

  private build(accent: string) {
    this.skinMat = this.makeMat('#f6cdb0', 0.7);
    this.clothMat = this.makeMat(accent || '#7c83ff', 0.8);
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
    const torsoMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.5, 8, 16), this.clothMat);
    torsoMesh.position.y = 0.45;
    torso.add(torsoMesh);
    // chest accent
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), this.makeMat('#ffffff', 0.6));
    chest.position.set(0, 0.62, 0.26);
    chest.scale.set(1.1, 0.7, 0.5);
    torso.add(chest);

    // Neck + Head
    const head = new THREE.Group();
    head.position.y = 1.0;
    torso.add(head);
    this.joints.head = head;
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 32), this.skinMat);
    head.add(headMesh);
    // hair (back + top)
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.33, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.62), this.hairMat);
    hair.position.y = 0.04;
    hair.rotation.x = d2r(-8);
    head.add(hair);
    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.31, 24, 24), this.hairMat);
    hairBack.position.set(0, -0.02, -0.08);
    hairBack.scale.set(1, 1.05, 0.8);
    head.add(hairBack);
    // eyes
    const eyeGeo = new THREE.SphereGeometry(0.06, 16, 16);
    const whiteMat = this.makeMat('#ffffff', 0.3);
    const pupilMat = this.makeMat('#1a1320', 0.2);
    this.eyeL = new THREE.Mesh(eyeGeo, whiteMat);
    this.eyeR = new THREE.Mesh(eyeGeo, whiteMat);
    this.eyeL.position.set(-0.11, 0.02, 0.27);
    this.eyeR.position.set(0.11, 0.02, 0.27);
    const pL = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 12), pupilMat);
    const pR = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 12), pupilMat);
    pL.position.z = 0.04; pR.position.z = 0.04;
    this.eyeL.add(pL); this.eyeR.add(pR);
    head.add(this.eyeL, this.eyeR);
    // dark circles (hidden)
    const dcGeo = new THREE.SphereGeometry(0.05, 12, 12);
    const dcMat = this.makeMat('#6b4a6b', 0.9);
    this.darkL = new THREE.Mesh(dcGeo, dcMat);
    this.darkR = new THREE.Mesh(dcGeo, dcMat);
    this.darkL.position.set(-0.13, -0.07, 0.28);
    this.darkR.position.set(0.13, -0.07, 0.28);
    this.darkL.scale.set(1.4, 0.7, 0.4); this.darkR.scale.set(1.4, 0.7, 0.4);
    this.darkL.visible = false; this.darkR.visible = false;
    head.add(this.darkL, this.darkR);
    // mouth
    this.mouth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.02), this.makeMat('#9c4a5a', 0.6));
    this.mouth.position.set(0, -0.13, 0.28);
    head.add(this.mouth);

    // Arms (shoulder -> upper -> elbow -> lower -> hand)
    const armGeo = new THREE.CapsuleGeometry(0.07, 0.32, 6, 12);
    for (const side of [-1, 1] as const) {
      const s = side < 0 ? 'L' : 'R';
      const shoulder = new THREE.Group();
      shoulder.position.set(0.34 * side, 0.84, 0);
      torso.add(shoulder);
      this.joints['armU' + s] = shoulder;
      const upper = new THREE.Mesh(armGeo, this.clothMat);
      upper.position.y = -0.2;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.4;
      shoulder.add(elbow);
      this.joints['armE' + s] = elbow;
      const lower = new THREE.Mesh(armGeo, this.skinMat);
      lower.position.y = -0.18;
      elbow.add(lower);
      const handG = new THREE.Group();
      handG.position.y = -0.36;
      elbow.add(handG);
      this.joints['hand' + s] = handG;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), this.skinMat);
      handG.add(hand);
    }

    // Legs (hip -> upper -> knee -> lower -> foot)
    const legGeo = new THREE.CapsuleGeometry(0.1, 0.34, 6, 12);
    const footGeo = new THREE.BoxGeometry(0.16, 0.1, 0.26);
    for (const side of [-1, 1] as const) {
      const s = side < 0 ? 'L' : 'R';
      const hip = new THREE.Group();
      hip.position.set(0.16 * side, -0.05, 0);
      pelvis.add(hip);
      this.joints['legU' + s] = hip;
      const upper = new THREE.Mesh(legGeo, this.clothMat);
      upper.position.y = -0.25;
      hip.add(upper);
      const knee = new THREE.Group();
      knee.position.y = -0.5;
      hip.add(knee);
      this.joints['legK' + s] = knee;
      const lower = new THREE.Mesh(legGeo, this.skinMat);
      lower.position.y = -0.23;
      knee.add(lower);
      const footG = new THREE.Group();
      footG.position.y = -0.46;
      knee.add(footG);
      this.joints['foot' + s] = footG;
      const foot = new THREE.Mesh(footGeo, this.makeMat('#2c2536', 0.7));
      foot.position.set(0, 0, 0.06);
      footG.add(foot);
    }

    // Laptop (base + hinged screen)
    this.laptop = new THREE.Group();
    pelvis.add(this.laptop);
    // Register as a "joint" so poses can move it and applyRest() can snapshot it.
    this.joints.laptop = this.laptop;
    const baseMat = this.makeMat('#cfd6e6', 0.5, 0.3);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.46), baseMat);
    this.laptop.add(base);
    const keys = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.01, 0.4), this.makeMat('#9aa3b8', 0.6));
    keys.position.y = 0.025;
    this.laptop.add(keys);
    this.laptopScreen = new THREE.Group();
    this.laptopScreen.position.set(0, 0.02, -0.22);
    this.laptop.add(this.laptopScreen);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.44, 0.03), this.makeMat('#222633', 0.4, 0.2));
    screen.position.set(0, 0.22, 0);
    const screenFace = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36), new THREE.MeshBasicMaterial({ color: new THREE.Color(accent || '#7c83ff') }));
    screenFace.position.set(0, 0.22, 0.02);
    this.laptopScreen.add(screen, screenFace);

    // Pillow
    this.pillow = new THREE.Group();
    pelvis.add(this.pillow);
    this.joints.pillow = this.pillow;
    const pillowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.42), this.makeMat('#f3e6f0', 0.9));
    pillowMesh.geometry.translate(0, 0, 0);
    this.pillow.add(pillowMesh);

    // name body parts for raycast
    g.traverse((o: any) => {
      if (o.isMesh) o.userData.part = o.userData.part || 'body';
    });
    this.eyeL.userData.part = 'eye';
    this.eyeR.userData.part = 'eye';
    this.mouth.userData.part = 'mouth';
    head.userData.part = 'head';
    this.laptop.userData.part = 'laptop';
    this.pillow.userData.part = 'pillow';
    this.joints.armUL.userData.part = 'arm';
    this.joints.armUR.userData.part = 'arm';
    this.joints.legUL.userData.part = 'leg';
    this.joints.legUR.userData.part = 'leg';
  }

  private applyRest() {
    // store rest positions for joints we move
    for (const name of ['pelvis', 'laptop', 'pillow']) {
      this.restPos[name] = this.joints[name].position.clone();
    }
  }

  // ── Poses (target euler per joint, plus position offsets for pelvis/laptop/pillow)
  private poseFor(b: Behavior): Pose {
    const Z = d2r(0);
    const SIT_U = d2r(78);   // thigh forward
    const SIT_L = d2r(-78);  // shin back to vertical
    const base: Pose = {
      rot: {
        pelvis: [0, 0, 0] as Vec3,
        torso: [d2r(-6), 0, 0] as Vec3,
        head: [0, 0, 0] as Vec3,
        armUL: [0, 0, d2r(18)], armUR: [0, 0, d2r(-18)],
        armEL: [d2r(95), 0, 0], armER: [d2r(95), 0, 0],
        handL: [0, 0, 0], handR: [0, 0, 0],
        legUL: [SIT_U, 0, 0], legUR: [SIT_U, 0, 0],
        legKL: [SIT_L, 0, 0], legKR: [SIT_L, 0, 0],
        footL: [d2r(70), 0, 0], footR: [d2r(70), 0, 0]
      },
      pos: {
        pelvis: [0, -0.05, 0],
        laptop: [0, 0.02, 0.42],
        pillow: [0, 0.02, -0.05]
      },
      screen: d2r(105),
      laptopFallen: false
    };

    switch (b) {
      case 'working':
        return { ...base, rot: { ...base.rot, torso: [d2r(-14), 0, 0], head: [d2r(10), 0, 0], armEL: [d2r(112), 0, 0], armER: [d2r(112), 0, 0] }, screen: d2r(100) };
      case 'idle':
        return { ...base, rot: { ...base.rot, torso: [d2r(-4), 0, 0], armEL: [d2r(92), 0, 0], armER: [d2r(92), 0, 0] } };
      case 'sleeping':
        return {
          ...base,
          rot: { ...base.rot, torso: [d2r(2), 0, d2r(8)], head: [d2r(38), 0, d2r(10)], armEL: [d2r(70), 0, 0], armER: [d2r(70), 0, 0], legUL: [d2r(60), 0, 0], legUR: [d2r(60), 0, 0], legKL: [d2r(-60), 0, 0], legKR: [d2r(-60), 0, 0] },
          pos: { pelvis: [0.18, -0.02, 0.05], laptop: [0.2, -0.1, 0.55], pillow: [0.2, 0.18, 0.2] },
          screen: d2r(8), laptopFallen: true
        };
      case 'laying':
        return {
          ...base,
          rot: { ...base.rot, torso: [d2r(20), 0, d2r(12)], head: [d2r(30), 0, d2r(14)], armEL: [d2r(40), 0, d2r(20)], armER: [d2r(40), 0, d2r(-20)], legUL: [d2r(95), 0, 0], legUR: [d2r(95), 0, 0], legKL: [d2r(-95), 0, 0], legKR: [d2r(-95), 0, 0] },
          pos: { pelvis: [0.2, -0.02, 0.0], laptop: [0.25, -0.18, 0.5], pillow: [0.22, 0.16, 0.18] },
          screen: d2r(4), laptopFallen: true
        };
      case 'walk':
        // Moving the pet (right-drag) must NOT change its size. So "walk" keeps
        // the exact sitting posture/height of idle — it does not stand up — and
        // the motion is expressed as a subtle bob + sway in update().
        return {
          ...base,
          rot: {
            ...base.rot,
            torso: [d2r(-2), 0, 0],
            head: [d2r(-3), 0, 0],
            armEL: [d2r(90), 0, 0], armER: [d2r(90), 0, 0]
          },
          pos: { pelvis: [0, -0.05, 0], laptop: [0, 0.02, 0.42], pillow: [0, 0.02, -0.05] },
          screen: d2r(100), laptopFallen: false
        };
      case 'celebrate':
        return {
          ...base,
          rot: { ...base.rot, torso: [d2r(-2), 0, 0], head: [d2r(-6), 0, 0], armUL: [0, 0, d2r(150)], armUR: [0, 0, d2r(-150)], armEL: [d2r(20), 0, 0], armER: [d2r(20), 0, 0] },
          screen: d2r(100)
        };
      case 'poke':
        return base;
      case 'talking':
        return { ...base, rot: { ...base.rot, head: [d2r(-2), 0, 0], armEL: [d2r(80), 0, 0], armER: [d2r(80), 0, 0] } };
      case 'sad':
        return { ...base, rot: { ...base.rot, torso: [d2r(8), 0, 0], head: [d2r(14), 0, 0], armUL: [0, 0, d2r(35)], armUR: [0, 0, d2r(-35)], armEL: [d2r(40), 0, 0], armER: [d2r(40), 0, 0] } };
      case 'hello':
        // Raise the right arm and give a friendly wave (oscillated in update()).
        return {
          ...base,
          rot: {
            ...base.rot,
            torso: [d2r(-4), 0, 0],
            head: [d2r(-8), 0, 0],
            armUR: [0, 0, d2r(-150)],
            armER: [d2r(20), 0, 0],
            handR: [0, 0, 0]
          },
          screen: d2r(100)
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
    // eyes
    switch (e) {
      case 'happy': this.eyeOpenTarget = 0.5; this.mouthOpenTarget = 0.3; break;
      case 'surprised': this.eyeOpenTarget = 1.3; this.mouthOpenTarget = 1; break;
      case 'sad': this.eyeOpenTarget = 0.8; this.mouthOpenTarget = 0; break;
      case 'angry': this.eyeOpenTarget = 0.9; this.mouthOpenTarget = 0; break;
      default: this.eyeOpenTarget = 1; this.mouthOpenTarget = 0; break;
    }
    if (this.behavior === 'sleeping' || this.behavior === 'laying') this.eyeOpenTarget = 0.08;
  }

  setLipSync(on: boolean): void { this.lipSync = on; }
  setDarkCircles(on: boolean): void {
    this.darkCircles = on;
    this.darkVisTarget = on ? 1 : 0;
    if (this.behavior !== 'sleeping' && this.behavior !== 'laying') this.setExpression(this.expressionFor(this.behavior));
  }

  setScale(s: number): void { this.object.scale.setScalar(s); }

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
      // Subtle bob + side sway only — the figure stays seated, so its silhouette
      // (and on-screen size) is identical to idle. Only the resize grip changes size.
      const bob = Math.abs(Math.sin(t * 9)) * 0.03;
      this.joints.pelvis.position.y = lerp(this.joints.pelvis.position.y, this.restPos.pelvis.y - 0.05 + bob, 0.35);
      this.object.rotation.z = lerp(this.object.rotation.z, Math.sin(t * 6) * 0.025, 0.3);
    } else {
      this.object.rotation.z = lerp(this.object.rotation.z, 0, 0.2);
      this.object.rotation.y = lerp(this.object.rotation.y, 0, 0.2);
    }
    if (this.behavior === 'celebrate') {
      this.joints.pelvis.position.y = lerp(this.joints.pelvis.position.y, this.restPos.pelvis.y + Math.abs(Math.sin(t * 7)) * 0.2, 0.4);
    }

    // Hello wave: oscillate the raised right forearm (handR sits under armE).
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
        // revert to previous resting behavior implicitly via next setBehavior
      }
    }

    // face
    this.eyeOpen = lerp(this.eyeOpen, this.eyeOpenTarget, k);
    this.eyeL.scale.y = this.eyeOpen; this.eyeR.scale.y = this.eyeOpen;
    this.eyeL.scale.x = lerp(this.eyeL.scale.x, this.eyeOpen < 0.3 ? 1.6 : 1, k);
    this.eyeR.scale.x = lerp(this.eyeR.scale.x, this.eyeOpen < 0.3 ? 1.6 : 1, k);
    this.mouthOpen = lerp(this.mouthOpen, this.mouthOpenTarget + (this.lipSync ? Math.abs(Math.sin(t * 18)) * 0.8 : 0), 0.5);
    this.mouth.scale.set(1, 1, this.mouthOpen * 3 + 0.2);
    this.mouth.position.y = lerp(this.mouth.position.y, -0.13 - this.mouthOpen * 0.02, 0.3);
    this.darkVis = lerp(this.darkVis, this.darkVisTarget, k);
    this.darkL.visible = this.darkVis > 0.02; this.darkR.visible = this.darkVis > 0.02;
    (this.darkL.material as THREE.MeshStandardMaterial).opacity = this.darkVis;
    (this.darkL.material as THREE.MeshStandardMaterial).transparent = true;
    (this.darkR.material as THREE.MeshStandardMaterial).opacity = this.darkVis;
    (this.darkR.material as THREE.MeshStandardMaterial).transparent = true;
  }

  dispose(): void {
    this.object.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) { const m = o.material; Array.isArray(m) ? m.forEach((x) => x.dispose?.()) : m.dispose?.(); }
    });
  }
}

// ============================================================== VRMCharacter
// Loads a VRoid `.vrm`. Falls back to ProceduralWaifu if anything fails.
class VRMCharacter implements Character {
  object = new THREE.Group();
  private vrm: any = null;
  private behavior: Behavior = 'idle';
  private expression: ExpressionName = 'neutral';
  private lipSync = false;
  private darkCircles = false;
  private laptop: THREE.Group;
  private pillow: THREE.Group;
  private target: Record<string, Vec3> = {};
  private loaded = false;
  private fallback: ProceduralWaifu | null = null;
  private usingFallback = false;

  constructor(accent: string) {
    // laptop + pillow as primitive props parented to VRM bones later
    this.laptop = new THREE.Group();
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xcfd6e6, roughness: 0.5, metalness: 0.3 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.46), baseMat);
    this.laptop.add(base);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.44, 0.03), new THREE.MeshStandardMaterial({ color: 0x222633 }));
    screen.position.set(0, 0.23, -0.22);
    this.laptop.add(screen);
    this.laptop.visible = false;
    this.object.add(this.laptop);

    this.pillow = new THREE.Group();
    const pm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.42), new THREE.MeshStandardMaterial({ color: 0xf3e6f0, roughness: 0.9 }));
    this.pillow.add(pm);
    this.pillow.visible = false;
    this.object.add(this.pillow);
  }

  async load(url: string, accent: string): Promise<void> {
    try {
      // Variable specifiers keep `three-vrm` optional: it is not a hard
      // dependency, so the app still builds/loads (procedural fallback) in
      // environments where the package isn't installed. Install `three-vrm@^3`
      // (a normal npm registry) to enable real VRM characters.
      const gltfSpec: string = 'three/examples/jsm/loaders/GLTFLoader.js';
      const vrmSpec: string = 'three-vrm';
      const gltfMod: any = await import(gltfSpec);
      const vrmMod: any = await import(vrmSpec);
      const GLTFLoader = gltfMod.GLTFLoader;
      const VRMLoaderPlugin = vrmMod.VRMLoaderPlugin;
      const VRMUtils = vrmMod.VRMUtils;
      const loader = new (GLTFLoader as any)();
      loader.register((parser: any) => new (VRMLoaderPlugin as any)(parser));
      const gltf: any = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm;
      if (!vrm) throw new Error('no vrm in gltf');
      VRMUtils.removeUnnecessaryJoints(vrm.scene);
      vrm.scene.rotation.y = Math.PI;
      this.object.add(vrm.scene);
      this.vrm = vrm;
      this.loaded = true;
      // parent props to bones
      const handR = vrm.humanoid?.getNormalizedBoneNode('rightWrist') || vrm.humanoid?.getNormalizedBoneNode('rightHand');
      if (handR) { this.laptop.position.set(0.1, -0.1, 0.1); handR.add(this.laptop); }
      this.laptop.visible = true;
      const head = vrm.humanoid?.getNormalizedBoneNode('head');
      if (head) { this.pillow.position.set(0, 0.1, -0.25); head.add(this.pillow); }
      this.pillow.visible = true;
      if (accent) {
        // optional: tint nothing by default; VRM carries its own materials
      }
    } catch (err) {
      console.error('[pet] VRM load failed, using procedural fallback', err);
      this.usingFallback = true;
      this.fallback = new ProceduralWaifu(accent);
      this.object.add(this.fallback.object);
    }
  }

  private bone(name: string): THREE.Object3D | null {
    return this.vrm?.humanoid?.getNormalizedBoneNode(name) || null;
  }

  private poseFor(b: Behavior): Record<string, Vec3> {
    const r = d2r;
    const map: Record<string, Vec3> = { pelvis: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], leftUpperArm: [0, 0, r(15)], rightUpperArm: [0, 0, r(-15)], leftLowerArm: [r(80), 0, 0], rightLowerArm: [r(80), 0, 0], leftUpperLeg: [r(70), 0, 0], rightUpperLeg: [r(70), 0, 0], leftLowerLeg: [r(-70), 0, 0], rightLowerLeg: [r(-70), 0, 0] };
    switch (b) {
      case 'working': map.spine = [r(-12), 0, 0]; map.head = [r(10), 0, 0]; map.leftLowerArm = [r(100), 0, 0]; map.rightLowerArm = [r(100), 0, 0]; break;
      case 'idle': map.spine = [r(-4), 0, 0]; break;
      case 'sleeping': map.spine = [r(6), 0, r(10)]; map.head = [r(36), 0, r(12)]; map.leftUpperArm = [0, 0, r(35)]; map.rightUpperArm = [0, 0, r(-35)]; map.leftLowerArm = [r(50), 0, 0]; map.rightLowerArm = [r(50), 0, 0]; break;
      case 'laying': map.spine = [r(20), 0, r(14)]; map.head = [r(28), 0, r(16)]; map.leftUpperLeg = [r(95), 0, 0]; map.rightUpperLeg = [r(95), 0, 0]; map.leftLowerLeg = [r(-95), 0, 0]; map.rightLowerLeg = [r(-95), 0, 0]; map.leftUpperArm = [0, 0, r(45)]; map.rightUpperArm = [0, 0, r(-45)]; break;
      case 'walk': map.spine = [r(2), 0, 0]; map.head = [r(-4), 0, 0]; map.leftUpperArm = [0, 0, r(40)]; map.rightUpperArm = [0, 0, r(-40)]; map.leftLowerArm = [r(55), 0, 0]; map.rightLowerArm = [r(55), 0, 0]; break;
      case 'celebrate': map.spine = [r(-2), 0, 0]; map.head = [r(-6), 0, 0]; map.leftUpperArm = [0, 0, r(150)]; map.rightUpperArm = [0, 0, r(-150)]; map.leftLowerArm = [r(20), 0, 0]; map.rightLowerArm = [r(20), 0, 0]; break;
      case 'sad': map.spine = [r(8), 0, 0]; map.head = [r(14), 0, 0]; map.leftUpperArm = [0, 0, r(35)]; map.rightUpperArm = [0, 0, r(-35)]; break;
      case 'hello': map.spine = [r(-4), 0, 0]; map.head = [r(-8), 0, 0]; map.rightUpperArm = [0, 0, r(-150)]; map.rightLowerArm = [r(20), 0, 0]; break;
      case 'talking': map.head = [r(-2), 0, 0]; break;
    }
    return map;
  }

  setBehavior(b: Behavior, _opts?: { part?: string }): void {
    this.behavior = b;
    if (this.usingFallback && this.fallback) { this.fallback.setBehavior(b, _opts); return; }
    this.target = this.poseFor(b);
    this.applyExpression(this.expressionFor(b));
  }

  private expressionFor(b: Behavior): ExpressionName {
    if (b === 'celebrate') return 'happy';
    if (b === 'sad') return 'sad';
    if (b === 'talking') return 'surprised';
    if (b === 'hello') return 'happy';
    return this.darkCircles ? 'angry' : 'neutral';
  }

  private applyExpression(e: ExpressionName): void {
    const em = this.vrm?.expressionManager;
    if (!em) return;
    const presets: Record<ExpressionName, string> = { neutral: 'neutral', happy: 'happy', sad: 'sad', surprised: 'surprised', angry: 'angry' };
    for (const key of ['happy', 'sad', 'surprised', 'angry']) em.setValue(key, 0);
    em.setValue(presets[e], 1);
  }

  setExpression(e: ExpressionName): void {
    this.expression = e;
    if (this.usingFallback && this.fallback) { this.fallback.setExpression(e); return; }
    this.applyExpression(e);
  }

  setLipSync(on: boolean): void {
    this.lipSync = on;
    if (this.usingFallback && this.fallback) { this.fallback.setLipSync(on); return; }
    const em = this.vrm?.expressionManager;
    if (em) em.setValue('aa', on ? 1 : 0);
  }

  setDarkCircles(on: boolean): void {
    this.darkCircles = on;
    if (this.usingFallback && this.fallback) { this.fallback.setDarkCircles(on); return; }
    const em = this.vrm?.expressionManager;
    if (em) em.setValue('sad', on ? 1 : 0);
  }

  setScale(s: number): void { this.object.scale.setScalar(s); }

  raycastPart(ndc: THREE.Vector2, cam: THREE.Camera): string | null {
    if (this.usingFallback && this.fallback) return this.fallback.raycastPart(ndc, cam);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cam as THREE.PerspectiveCamera);
    const hits = ray.intersectObject(this.object, true);
    return hits.length ? (hits[0].object.userData?.part || 'body') : null;
  }

  update(dt: number, t: number): void {
    if (this.usingFallback && this.fallback) { this.fallback.update(dt, t); return; }
    if (!this.vrm) return;
    const k = clamp(dt * 8, 0, 1);
    for (const boneName in this.target) {
      const bone = this.bone(boneName);
      if (!bone) continue;
      const [tx, ty, tz] = this.target[boneName];
      bone.rotation.x = lerp(bone.rotation.x, tx, k);
      bone.rotation.y = lerp(bone.rotation.y, ty, k);
      bone.rotation.z = lerp(bone.rotation.z, tz, k);
    }
    if (this.lipSync) {
      const em = this.vrm.expressionManager;
      if (em) em.setValue('aa', Math.abs(Math.sin(t * 18)) > 0.5 ? 1 : 0);
    }
    // gentle breathing via spine
    const breathe = Math.sin(t * 1.6) * 0.02;
    const spine = this.bone('spine');
    if (spine) spine.rotation.x = lerp(spine.rotation.x, (this.target.spine?.[0] || 0) + breathe, k);
    this.vrm.update(dt);
  }

  dispose(): void {
    this.object.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) { const m = o.material; Array.isArray(m) ? m.forEach((x) => x.dispose?.()) : m.dispose?.(); }
    });
  }
}

// ================================================================ GLBCharacter
// Loads an arbitrary glTF/GLB model (three's bundled GLTFLoader — no extra
// dependency). Because rigs vary wildly across models, this character drives
// behavior by transforming the whole model root (sit / lean / lie down / wave)
// and parenting the laptop + pillow props to it, rather than trying to pose a
// specific skeleton. Falls back to ProceduralWaifu if the file fails to load.
class GLBCharacter implements Character {
  object = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private behavior: Behavior = 'idle';
  private expression: ExpressionName = 'neutral';
  private lipSync = false;
  private darkCircles = false;
  private laptop: THREE.Group;
  private pillow: THREE.Group;
  private loaded = false;
  private fallback: ProceduralWaifu | null = null;
  private usingFallback = false;

  constructor(accent: string) {
    this.laptop = this.makeProp(accent);
    this.pillow = this.makePillow();
    this.object.add(this.laptop, this.pillow);
  }

  private makeProp(accent: string): THREE.Group {
    const g = new THREE.Group();
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xcfd6e6, roughness: 0.5, metalness: 0.3 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.46), baseMat);
    g.add(base);
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.44, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x222633 })
    );
    screen.position.set(0, 0.23, -0.22);
    g.add(screen);
    g.visible = false;
    return g;
  }

  private makePillow(): THREE.Group {
    const g = new THREE.Group();
    const pm = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.2, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xf3e6f0, roughness: 0.9 })
    );
    g.add(pm);
    g.visible = false;
    return g;
  }

  async load(url: string): Promise<void> {
    try {
      // three's GLTFLoader ships with the `three` package — no new dependency.
      const gltfMod: any = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const GLTFLoader = gltfMod.GLTFLoader;
      const loader = new (GLTFLoader as any)();
      const gltf: any = await loader.loadAsync(url);
      let model = gltf.scene as THREE.Object3D;
      if (!model) throw new Error('empty gltf');

      // Normalize scale so the model fills a sensible portion of the stage, and
      // lift it so its feet rest near y=0 (the waifu's ground plane).
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const targetHeight = 1.7; // ~ the procedural character's height
      const scale = targetHeight / maxDim;
      model.scale.setScalar(scale);
      const box2 = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      box2.getCenter(center);
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= box2.min.y;

      // Face the camera.
      model.rotation.y = Math.PI;
      this.model = model;
      this.object.add(model);
      this.loaded = true;

      // Parent props to the model root so they move with it.
      this.laptop.position.set(0, 0.0, 0.42);
      this.object.add(this.laptop);
      this.laptop.visible = true;
      this.pillow.position.set(0, 0.0, -0.05);
      this.object.add(this.pillow);
      this.pillow.visible = true;
    } catch (err) {
      console.error('[pet] GLB load failed, using procedural fallback', err);
      this.usingFallback = true;
      this.fallback = new ProceduralWaifu('#7c83ff');
      this.object.add(this.fallback.object);
    }
  }

  private glbPoseFor(b: Behavior): { rot: Vec3; pos: Vec3 } {
    const r = d2r;
    switch (b) {
      case 'working':
        return { rot: [r(-10), 0, 0], pos: [0, 0, 0.15] };
      case 'idle':
        return { rot: [r(-4), 0, 0], pos: [0, 0, 0] };
      case 'sleeping':
        return { rot: [r(70), 0, r(8)], pos: [0.3, -0.2, 0.3] };
      case 'laying':
        return { rot: [r(82), 0, r(12)], pos: [0.35, -0.2, 0.1] };
      case 'walk':
        // Keep the model in place height-wise; moving must not change its size.
        return { rot: [r(2), 0, 0], pos: [0, 0, 0] };
      case 'celebrate':
        return { rot: [r(-2), 0, 0], pos: [0, 0, 0] };
      case 'hello':
        return { rot: [r(-4), 0, 0], pos: [0, 0, 0] };
      case 'talking':
        return { rot: [r(-3), 0, 0], pos: [0, 0, 0.05] };
      case 'sad':
        return { rot: [r(8), 0, 0], pos: [0, 0, 0] };
      case 'poke':
        return { rot: [0, 0, 0], pos: [0, 0, 0] };
      default:
        return { rot: [r(-4), 0, 0], pos: [0, 0, 0] };
    }
  }

  setBehavior(b: Behavior, _opts?: { part?: string }): void {
    this.behavior = b;
    if (this.usingFallback && this.fallback) { this.fallback.setBehavior(b, _opts); return; }
    this.target = this.glbPoseFor(b);
  }

  setExpression(e: ExpressionName): void {
    this.expression = e;
    if (this.usingFallback && this.fallback) { this.fallback.setExpression(e); }
  }

  setLipSync(on: boolean): void {
    this.lipSync = on;
    if (this.usingFallback && this.fallback) { this.fallback.setLipSync(on); }
  }

  setDarkCircles(on: boolean): void {
    this.darkCircles = on;
    if (this.usingFallback && this.fallback) { this.fallback.setDarkCircles(on); }
  }

  setScale(s: number): void { this.object.scale.setScalar(s); }

  raycastPart(ndc: THREE.Vector2, cam: THREE.Camera): string | null {
    if (this.usingFallback && this.fallback) return this.fallback.raycastPart(ndc, cam);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cam as THREE.PerspectiveCamera);
    const hits = ray.intersectObject(this.object, true);
    return hits.length ? (hits[0].object.userData?.part || 'body') : null;
  }

  private target: { rot: Vec3; pos: Vec3 } = { rot: [0, 0, 0], pos: [0, 0, 0] };

  update(dt: number, t: number): void {
    if (this.usingFallback && this.fallback) { this.fallback.update(dt, t); return; }
    if (!this.loaded || !this.model) return;
    const k = clamp(dt * 6, 0, 1);
    const { rot, pos } = this.target;
    this.model.rotation.x = lerp(this.model.rotation.x, rot[0], k);
    this.model.rotation.y = lerp(this.model.rotation.y, Math.PI + rot[1], k);
    this.model.rotation.z = lerp(this.model.rotation.z, rot[2], k);
    this.model.position.x = lerp(this.model.position.x, pos[0], k);
    this.model.position.z = lerp(this.model.position.z, pos[2], k);

    // Gentle breathing / idle bob.
    const breathe = Math.sin(t * 1.6) * 0.015;
    this.model.position.y = lerp(this.model.position.y, (this as any)._groundY ?? 0, k) + breathe;

    // Celebrate hop.
    if (this.behavior === 'celebrate') {
      this.model.position.y += Math.abs(Math.sin(t * 7)) * 0.12;
    }

    // Hello wave: a subtle side-to-side sway of the whole upper body.
    if (this.behavior === 'hello') {
      this.model.rotation.z = lerp(this.model.rotation.z, Math.sin(t * 10) * 0.06, 0.5);
    }
  }

  dispose(): void {
    this.object.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) { const m = o.material; Array.isArray(m) ? m.forEach((x) => x.dispose?.()) : m.dispose?.(); }
    });
  }
}

// =============================================================== PetApp (engine)
class PetApp {
  private character: Character | null = null;
  private root = new THREE.Group();
  private current: Behavior = 'idle';
  private prevBeforeTalking: Behavior = 'idle';
  private talkTimer = 0;
  private accent = '#7c83ff';
  private raycaster = new THREE.Raycaster();
  private speech: HTMLDivElement;
  private audioCtx: AudioContext | null = null;
  private dragging = false;
  private resizing = false;
  private lastX = 0;
  private lastY = 0;
  private clock = new THREE.Clock();

  constructor() {
    scene.add(this.root);
    this.speech = this.buildSpeechBubble();
    this.bindPointer();
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private buildSpeechBubble(): HTMLDivElement {
    const el = document.createElement('div');
    el.id = 'pet-speech';
    el.style.cssText = `position:absolute;left:50%;top:8px;transform:translateX(-50%);max-width:80%;padding:6px 10px;border-radius:12px;background:rgba(20,20,28,.92);color:#fff;font:600 13px/1.3 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.35);opacity:0;transition:opacity .18s;pointer-events:none;text-align:center;white-space:pre-wrap;z-index:10;`;
    document.body.appendChild(el);
    return el;
  }

  private bindPointer() {
    canvas.addEventListener('pointerdown', (e) => {
      this.unlockAudio();
      if (e.button === 2) {
        // right-drag → move window + walk. Track deltas in SCREEN coordinates:
        // clientX/Y are window-relative, so once the window starts moving they
        // shift on their own (a feedback loop that fought the drag). screenX/Y
        // are unaffected by the window moving, so the drag stays 1:1 with the mouse.
        this.dragging = true;
        this.lastX = e.screenX; this.lastY = e.screenY;
        ipc.send('pet-drag-start');
        canvas.setPointerCapture(e.pointerId);
        if (this.current !== 'talking') this.setBehavior('walk');
      } else if (e.button === 0) {
        // left-click → poke a body part
        const ndc = this.toNdc(e);
        const part = this.character?.raycastPart(ndc, camera) || 'body';
        this.playBlip(520);
        this.character?.setBehavior('poke', { part });
        // revert after the poke recoil
        window.setTimeout(() => { if (this.current !== 'talking') this.setBehavior(this.current === 'poke' ? 'idle' : this.current); }, 650);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.screenX - this.lastX;
      const dy = e.screenY - this.lastY;
      this.lastX = e.screenX; this.lastY = e.screenY;
      ipc.send('pet-drag-delta', { dx, dy });
    });
    const end = () => {
      if (this.dragging) {
        this.dragging = false;
        ipc.send('pet-drag-end');
        if (this.current === 'walk') this.setBehavior(this.prevBeforeTalking || 'idle');
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    // resize grip
    const grip = document.getElementById('pet-resize');
    if (grip) {
      grip.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.resizing = true;
        this.lastX = e.screenX; this.lastY = e.screenY;
        grip.setPointerCapture(e.pointerId);
      });
      grip.addEventListener('pointermove', (e) => {
        if (!this.resizing) return;
        // Screen coordinates: the grip lives at the window's edge, so resizing
        // shifts its client coords under us. Bottom-left grip with the top-right
        // corner anchored (matches the pet's top-right dock): drag left = wider,
        // drag down = taller — so the grip tracks the cursor 1:1.
        const dx = e.screenX - this.lastX;
        const dy = e.screenY - this.lastY;
        this.lastX = e.screenX; this.lastY = e.screenY;
        ipc.send('pet-resize-delta', { dx: -dx, dy });
      });
      const endR = () => { this.resizing = false; };
      grip.addEventListener('pointerup', endR);
      grip.addEventListener('pointercancel', endR);
    }
  }

  private toNdc(e: PointerEvent): THREE.Vector2 {
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  /**
   * Sizes the character to the window. The scale is FIXED — it depends only on
   * the window dimensions, so the only thing that changes the pet's size is
   * dragging the resize grip. Poses (idle, walk, celebrate…) never rescale it.
   */
  private handleResize() {
    const w = window.innerWidth || 220;
    const h = window.innerHeight || 320;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Fill ~85% of the viewport height at z=0, referenced to the character's
    // full resting height so nothing overflows the window.
    const dist = camera.position.z - 0;
    const visibleH = 2 * Math.tan((camera.fov * Math.PI) / 360) * dist;
    const charH = 2.2;
    this.character?.setScale((visibleH * 0.85) / charH);
    // Re-seat the contact shadow to the character's feet.
    this.groundCharacter();
  }

  private unlockAudio() {
    if (this.audioCtx) return;
    try { this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { /* noop */ }
  }

  private playBlip(freq = 440) {
    if (!this.audioCtx) return;
    const o = this.audioCtx.createOscillator();
    const g = this.audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, this.audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, this.audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + 0.18);
    o.connect(g); g.connect(this.audioCtx.destination);
    o.start();
    o.stop(this.audioCtx.currentTime + 0.2);
  }

  async applyPartner(p: PartnerPayload | null) {
    if (!p) return;
    if (p.accent) this.accent = p.accent;
    // dispose old
    if (this.character) { this.root.remove(this.character.object); this.character.dispose(); this.character = null; }

    if (p.vrmPath) {
      const vrm = new VRMCharacter(this.accent);
      this.root.add(vrm.object);
      this.character = vrm;
      await vrm.load(nodeUrl.pathToFileURL(p.vrmPath).href, this.accent);
    } else if (p.modelPath) {
      const glb = new GLBCharacter(this.accent);
      this.root.add(glb.object);
      this.character = glb;
      await glb.load(nodeUrl.pathToFileURL(p.modelPath).href);
    } else {
      const w = new ProceduralWaifu(this.accent);
      this.root.add(w.object);
      this.character = w;
    }
    // Every mesh in the (possibly async-loaded) character should cast into the
    // contact shadow. Cheap to (re)apply on each partner swap.
    this.character?.object.traverse((o: any) => { if (o.isMesh) o.castShadow = true; });
    this.handleResize();
    this.groundCharacter();
    this.setBehavior(this.current);
  }

  /** Drops the contact-shadow plane to the character's current feet level. */
  private groundCharacter() {
    if (!this.character) return;
    this.character.object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(this.character.object);
    if (Number.isFinite(box.min.y)) groundShadow.position.y = box.min.y + 0.001;
  }

  setBehavior(b: Behavior) {
    if (b === 'talking') {
      this.prevBeforeTalking = this.current === 'talking' ? this.prevBeforeTalking : this.current;
      this.current = 'talking';
      this.character?.setBehavior('talking');
      return;
    }
    this.current = b;
    this.character?.setBehavior(b);
  }

  say(text: string) {
    this.speech.textContent = text;
    this.speech.style.opacity = '1';
    this.playBlip(620);
    this.setBehavior('talking');
    this.talkTimer = 4;
  }

  setDarkCircles(on: boolean) {
    this.character?.setDarkCircles(on);
  }

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = this.clock.getDelta();
      const t = this.clock.elapsedTime;
      if (this.talkTimer > 0) {
        this.talkTimer -= dt;
        if (this.talkTimer <= 0) {
          this.speech.style.opacity = '0';
          this.setBehavior(this.prevBeforeTalking || 'idle');
        }
      }
      this.character?.update(dt, t);
      renderer.render(scene, camera);
    };
    loop();
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────
const app = new PetApp();

ipc.on('pet-partner', (_e: unknown, p: PartnerPayload) => { void app.applyPartner(p); });
ipc.on('pet-mood', (_e: unknown, m: Behavior) => {
  if (m === 'working' || m === 'idle' || m === 'celebrate' || m === 'sad') app.setBehavior(m);
});
ipc.on('pet-behavior', (_e: unknown, b: Behavior) => app.setBehavior(b));
ipc.on('pet-say', (_e: unknown, payload: { text?: string }) => {
  if (payload && payload.text) app.say(payload.text);
});
ipc.on('pet-context', (_e: unknown, payload: { pct?: number }) => {
  app.setDarkCircles((payload?.pct ?? 0) >= 0.9);
});

app.start();
ipc.send('pet-ready');
