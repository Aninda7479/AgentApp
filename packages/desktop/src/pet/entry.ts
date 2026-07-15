/**
 * Three.js renderer + behavior engine for the free-roaming 3D Partner.
 *
 * This is the "Lily" pet: a cute little girl who sits with a laptop and a
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
 * Three character implementations share one interface:
 *   • Lily – built-in modular procedural 3D model, loaded dynamically.
 *   • VRMCharacter – loads a VRoid-exported `.vrm` (three-vrm) for a real anime
 *     girl with native facial expressions (talking lip-sync, dark circles…).
 *   • Custom model scripts resolved via p.scriptPath.
 *     Drop a `character.vrm` or custom `index.js` into the Partner folder to upgrade.
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
  playSound?(freq: number, audioCtx: AudioContext | null): void;
}

interface PartnerPayload {
  id?: string;
  name?: string;
  kind?: string;
  accent?: string;
  emoji?: string;
  model?: string;
  modelPath?: string | null;
  vrm?: string;
  vrmPath?: string | null;
  /** Folder-based model: relative path to a folder whose index.(js|ts) exports a Character class. */
  modelFolder?: string;
  /** Resolved absolute path to the model folder's compiled index.js (or index.ts). */
  modelFolderPath?: string | null;
  /** Optional procedural face overlay config for non-VRM GLB/glTF models. */
  faceOverlay?: boolean | { headFrac?: number; frontGap?: number; scale?: number } | null;
  script?: string;
  scriptPath?: string | null;
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

// ── Error logging for the pet window ────────────────────────────────────────────
// The pet window has no own toast UI; errors go to its console and (when possible)
// are forwarded to the main process, which surfaces them as a desktop toast.
function logPetError(context: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error('[pet-error]', context, '-', message, err instanceof Error ? '\n' + err.stack : '');
  try {
    if (ipc && typeof ipc.send === 'function') {
      ipc.send('pet-error', { context, message });
    }
  } catch {
    /* ignore IPC failures */
  }
}

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

// ============================================================ Lily Loader
let Lily: any;
try {
  Lily = require('../models/lily/index.js').Lily;
} catch (e) {
  console.error("Lily model not found dynamically. Drawing basic mesh.", e);
  // Basic fallback box mesh if Lily is completely missing (unlikely but safe)
  class BasicLily implements Character {
    object = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
    setBehavior() {}
    setExpression() {}
    setLipSync() {}
    setDarkCircles() {}
    setScale(s: number) { this.object.scale.setScalar(s); }
    update() {}
    raycastPart() { return null; }
    dispose() { this.object.geometry.dispose(); (this.object.material as any).dispose(); }
  }
  Lily = BasicLily;
}

// ============================================================== VRMCharacter
// Loads a VRoid `.vrm`. Falls back to Lily if anything fails.
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
  private fallback: Character | null = null;
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
      const fallback = new Lily(accent);
      this.fallback = fallback;
      this.object.add(fallback.object);
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
// specific skeleton. Falls back to Lily if the file fails to load.
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
  private fallback: Character | null = null;
  private usingFallback = false;

  // Optional procedural anime face drawn on top of a static (non-VRM) GLB so the
  // character can still show expressions, lip-sync, and dark circles. The model
  // itself has no blendshapes, so we fake the face as a camera-facing billboard
  // pinned to the model's head.
  private faceCfg: boolean | { headFrac?: number; frontGap?: number; scale?: number } | undefined;
  private face: {
    group: THREE.Group;
    eyeL: THREE.Group;
    eyeR: THREE.Group;
    mouth: THREE.Mesh;
    darkL: THREE.Mesh;
    darkR: THREE.Mesh;
    eyeOpen: number;
    eyeOpenTarget: number;
    mouthOpen: number;
    mouthOpenTarget: number;
    darkVis: number;
    darkVisTarget: number;
    headAnchor: THREE.Vector3;
  } | null = null;
  private _sizeY = 1;

  constructor(accent: string, faceOverlay?: boolean | { headFrac?: number; frontGap?: number; scale?: number }) {
    this.laptop = this.makeProp(accent);
    this.pillow = this.makePillow();
    this.object.add(this.laptop, this.pillow);
    this.faceCfg = faceOverlay;
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

  /**
   * Builds a small procedural anime face (two eyes, a mouth, optional dark
   * circles) that is pinned to the model's head and billboarded to the camera.
   * Used when a GLB has no blendshapes of its own, so Lily can still emote,
   * lip-sync, and show "tired" eyes on a static mesh (e.g. a Tripo export).
   */
  private buildFace(size: THREE.Vector3): void {
    const cfg = this.faceCfg;
    const headFrac = (typeof cfg === 'object' && cfg?.headFrac) || 0.9;
    const frontGap = (typeof cfg === 'object' && cfg?.frontGap) || 0.06;
    const fscale = (typeof cfg === 'object' && cfg?.scale) || 1;
    const unit = ((size.x + size.y) * 0.5) * 0.12 * fscale;

    const group = new THREE.Group();
    group.renderOrder = 999;

    const buildEye = (sign: number): THREE.Group => {
      const eye = new THREE.Group();
      const sclera = new THREE.Mesh(
        new THREE.CircleGeometry(unit, 22),
        new THREE.MeshBasicMaterial({ color: 0xfdfdff, transparent: true })
      );
      eye.add(sclera);
      const pupil = new THREE.Mesh(
        new THREE.CircleGeometry(unit * 0.55, 18),
        new THREE.MeshBasicMaterial({ color: 0x141826 })
      );
      pupil.position.z = 0.001;
      eye.add(pupil);
      const hi = new THREE.Mesh(
        new THREE.CircleGeometry(unit * 0.22, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      hi.position.set(-unit * 0.22, unit * 0.26, 0.002);
      eye.add(hi);
      eye.position.set(sign * unit * 1.7, 0, 0.002);
      return eye;
    };
    const eyeL = buildEye(-1);
    const eyeR = buildEye(1);
    group.add(eyeL, eyeR);

    const dark = (sign: number): THREE.Mesh => {
      const d = new THREE.Mesh(
        new THREE.CircleGeometry(unit * 1.1, 18),
        new THREE.MeshBasicMaterial({ color: 0x7a4f8a, transparent: true, opacity: 0 })
      );
      d.position.set(sign * unit * 2.1, -unit * 1.3, 0.001);
      d.visible = false;
      return d;
    };
    const darkL = dark(-1);
    const darkR = dark(1);
    group.add(darkL, darkR);

    const mouth = new THREE.Mesh(
      new THREE.SphereGeometry(unit * 0.7, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xd96b7a })
    );
    mouth.scale.set(1.3, 0.7, 0.6);
    mouth.position.set(0, -unit * 2.0, 0.003);
    group.add(mouth);

    // Anchor in model-local (pre-scale) coordinates; update() re-projects it to
    // world space every frame so it tracks the head through every pose.
    const headAnchor = new THREE.Vector3(0, size.y * headFrac, size.z * 0.5 + size.z * frontGap);
    group.position.copy(headAnchor);
    this.object.add(group);
    this._sizeY = size.y;
    this.face = {
      group, eyeL, eyeR, mouth, darkL, darkR,
      eyeOpen: 1, eyeOpenTarget: 1,
      mouthOpen: 0, mouthOpenTarget: 0,
      darkVis: 0, darkVisTarget: 0,
      headAnchor
    };
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
      // lift it so its feet rest near y=0 (Lily's ground plane).
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

      // Optional cute upgrade: paint a procedural anime face on a faceless mesh
      // (e.g. a Tripo-exported GLB) so Lily can still emote and talk.
      if (this.faceCfg) this.buildFace(size);
    } catch (err) {
      console.error('[pet] GLB load failed, using procedural fallback', err);
      this.usingFallback = true;
      const fallback = new Lily('#ff8fb3');
      this.fallback = fallback;
      this.object.add(fallback.object);
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
    if (this.usingFallback && this.fallback) { this.fallback.setExpression(e); return; }
    if (this.face) {
      switch (e) {
        case 'happy': this.face.eyeOpenTarget = 0.5; this.face.mouthOpenTarget = 0.3; break;
        case 'surprised': this.face.eyeOpenTarget = 1.35; this.face.mouthOpenTarget = 1; break;
        case 'sad': this.face.eyeOpenTarget = 0.8; this.face.mouthOpenTarget = 0; break;
        case 'angry': this.face.eyeOpenTarget = 0.9; this.face.mouthOpenTarget = 0; break;
        default: this.face.eyeOpenTarget = 1; this.face.mouthOpenTarget = 0; break;
      }
      if (this.behavior === 'sleeping' || this.behavior === 'laying') this.face.eyeOpenTarget = 0.08;
    }
  }

  setLipSync(on: boolean): void {
    this.lipSync = on;
    if (this.usingFallback && this.fallback) { this.fallback.setLipSync(on); }
  }

  setDarkCircles(on: boolean): void {
    this.darkCircles = on;
    if (this.usingFallback && this.fallback) { this.fallback.setDarkCircles(on); return; }
    if (this.face) this.face.darkVisTarget = on ? 1 : 0;
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

    // ── Procedural face overlay (static GLB with no blendshapes) ──────────────
    if (this.face) {
      const f = this.face;
      const blink =
        this.behavior !== 'sleeping' && this.behavior !== 'laying' && f.eyeOpenTarget > 0.5 && Math.sin(t * 0.9) > 0.988
          ? 0.12
          : 1;
      f.eyeOpen = lerp(f.eyeOpen, f.eyeOpenTarget * blink, 0.4);
      f.mouthOpen = lerp(
        f.mouthOpen,
        f.mouthOpenTarget + (this.lipSync ? Math.abs(Math.sin(t * 18)) * 0.8 : 0),
        0.5
      );
      f.darkVis = lerp(f.darkVis, f.darkVisTarget, 0.3);
      f.eyeL.scale.set(1, f.eyeOpen, 1);
      f.eyeR.scale.set(1, f.eyeOpen, 1);
      f.mouth.scale.set(1.3, 0.7 + f.mouthOpen * 3, 0.6);
      (f.darkL.material as THREE.MeshBasicMaterial).opacity = f.darkVis;
      f.darkL.visible = f.darkVis > 0.02;
      (f.darkR.material as THREE.MeshBasicMaterial).opacity = f.darkVis;
      f.darkR.visible = f.darkVis > 0.02;
      // Re-project to the head each frame so it tracks the pose, and billboard
      // toward the camera so the eyes/mouth always face you.
      this.model.updateMatrixWorld(true);
      this.object.updateMatrixWorld(true);
      const world = f.headAnchor.clone().applyMatrix4(this.model.matrixWorld);
      const toCam = camera.position.clone().sub(world).normalize().multiplyScalar(this._sizeY * 0.02);
      world.add(toCam);
      this.face.group.position.copy(this.object.worldToLocal(world.clone()));
      this.face.group.quaternion.copy(camera.quaternion);
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
        if (e.button === 0) {
          e.stopPropagation();
          this.resizing = true;
          this.lastX = e.screenX; this.lastY = e.screenY;
          grip.setPointerCapture(e.pointerId);
        } else if (e.button === 2) {
          e.stopPropagation();
          this.unlockAudio();
          this.dragging = true;
          this.lastX = e.screenX; this.lastY = e.screenY;
          ipc.send('pet-drag-start');
          grip.setPointerCapture(e.pointerId);
          if (this.current !== 'talking') this.setBehavior('walk');
        }
      });
      grip.addEventListener('pointermove', (e) => {
        if (this.resizing) {
          // Screen coordinates: the grip lives at the window's edge, so resizing
          // shifts its client coords under us. Bottom-left grip with the top-right
          // corner anchored (matches the pet's top-right dock): drag left = wider,
          // drag down = taller — so the grip tracks the cursor 1:1.
          const dx = e.screenX - this.lastX;
          const dy = e.screenY - this.lastY;
          this.lastX = e.screenX; this.lastY = e.screenY;
          ipc.send('pet-resize-delta', { dx: -dx, dy });
        } else if (this.dragging) {
          const dx = e.screenX - this.lastX;
          const dy = e.screenY - this.lastY;
          this.lastX = e.screenX; this.lastY = e.screenY;
          ipc.send('pet-drag-delta', { dx, dy });
        }
      });
      const endR = () => {
        if (this.resizing) {
          this.resizing = false;
        }
        if (this.dragging) {
          this.dragging = false;
          ipc.send('pet-drag-end');
          if (this.current === 'walk') this.setBehavior(this.prevBeforeTalking || 'idle');
        }
      };
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
    if (this.character && typeof this.character.playSound === 'function') {
      this.character.playSound(freq, this.audioCtx);
      return;
    }
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

    if (p.scriptPath) {
      try {
        const CustomClass = require(p.scriptPath).default || require(p.scriptPath);
        const char = new CustomClass(this.accent);
        this.root.add(char.object);
        this.character = char;
      } catch (e) {
        console.error('Failed to load custom character script, falling back to Lily', e);
        const lily = new Lily(this.accent);
        this.root.add(lily.object);
        this.character = lily;
      }
    } else if (p.modelFolderPath) {
      // Folder-based model: the folder's index.(js|ts) exports a Character class
      // (which may internally load a .vrm/.glb/.gltf from inside the folder).
      try {
        const ModelClass = require(p.modelFolderPath).default || require(p.modelFolderPath);
        const char = new ModelClass(this.accent);
        this.root.add(char.object);
        this.character = char;
      } catch (e) {
        console.error('Failed to load model folder, falling back to Lily', e);
        const lily = new Lily(this.accent);
        this.root.add(lily.object);
        this.character = lily;
      }
    } else if (p.vrmPath) {
      try {
        const vrm = new VRMCharacter(this.accent);
        this.root.add(vrm.object);
        this.character = vrm;
        await vrm.load(nodeUrl.pathToFileURL(p.vrmPath).href, this.accent);
      } catch (e) {
        console.error('Failed to load VRM, falling back to Lily', e);
        const lily = new Lily(this.accent);
        this.root.add(lily.object);
        this.character = lily;
      }
    } else if (p.modelPath) {
      try {
        const glb = new GLBCharacter(this.accent, p.faceOverlay ?? undefined);
        this.root.add(glb.object);
        this.character = glb;
        await glb.load(nodeUrl.pathToFileURL(p.modelPath).href);
      } catch (e) {
        console.error('Failed to load GLB, falling back to Lily', e);
        const lily = new Lily(this.accent);
        this.root.add(lily.object);
        this.character = lily;
      }
    } else {
      const lily = new Lily(this.accent);
      this.root.add(lily.object);
      this.character = lily;
    }
    // Every mesh in the (possibly async-loaded) character should cast into the
    // contact shadow. Cheap to (re)apply on each partner swap.
    try {
      this.character?.object.traverse((o: any) => { if (o.isMesh) o.castShadow = true; });
      this.handleResize();
      this.groundCharacter();
      this.setBehavior(this.current);
    } catch (err) {
      logPetError('pet-applyPartner-finalize', err);
    }
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
      try {
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
      } catch (err) {
        logPetError('pet-loop', err);
      }
    };
    loop();
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────
const app = new PetApp();

ipc.on('pet-partner', (_e: unknown, p: PartnerPayload) => {
  try { void app.applyPartner(p); } catch (err) { logPetError('pet-ipc:pet-partner', err); }
});
ipc.on('pet-mood', (_e: unknown, m: Behavior) => {
  try {
    if (m === 'working' || m === 'idle' || m === 'celebrate' || m === 'sad') app.setBehavior(m);
  } catch (err) { logPetError('pet-ipc:pet-mood', err); }
});
ipc.on('pet-behavior', (_e: unknown, b: Behavior) => {
  try { app.setBehavior(b); } catch (err) { logPetError('pet-ipc:pet-behavior', err); }
});
ipc.on('pet-say', (_e: unknown, payload: { text?: string }) => {
  try { if (payload && payload.text) app.say(payload.text); } catch (err) { logPetError('pet-ipc:pet-say', err); }
});
ipc.on('pet-context', (_e: unknown, payload: { pct?: number }) => {
  try { app.setDarkCircles((payload?.pct ?? 0) >= 0.9); } catch (err) { logPetError('pet-ipc:pet-context', err); }
});

try {
  app.start();
} catch (err) {
  logPetError('pet-boot', err);
}
ipc.send('pet-ready');
