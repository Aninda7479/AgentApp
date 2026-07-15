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

export class LaptopScreenAnimator {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  private lastUpdate = 0;
  private codeLines: string[] = [];
  private lastCodeLineTime = 0;

  constructor(width = 256, height = 180) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  update(behavior: Behavior, t: number, dt: number) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Throttle canvas draw to ~30 FPS for optimization
    const now = t;
    if (now - this.lastUpdate < 0.033) return;
    this.lastUpdate = now;

    ctx.clearRect(0, 0, w, h);

    if (behavior === 'working' || behavior === 'talking') {
      // ── Typing / Working Mode: scrolling green/cyan terminal code ──────────
      ctx.fillStyle = '#0f172a'; // dark background
      ctx.fillRect(0, 0, w, h);

      // Draw header
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('> LILY-AGENT // ACTIVE', 10, 18);

      // Draw code lines
      ctx.fillStyle = '#38bdf8'; // cyan text
      ctx.font = '9px monospace';

      // Generate snippet code lines
      if (this.codeLines.length === 0 || now - this.lastCodeLineTime > 0.4) {
        this.lastCodeLineTime = now;
        const snippets = [
          'const lily = new Partner("Lily");',
          'await lily.calmUser();',
          'sys.optimize({ memory: "WebP" });',
          'process.env.STRESS_LEVEL = 0;',
          'heart.pulse({ frequency: 1.05 });',
          'brain.relax();',
          'npm run dev --harmony',
          'const relax = true;',
          'import { breathe } from "relax";',
          'breathe.inhale(); // resonant',
          'breathe.exhale(); // peaceful'
        ];
        this.codeLines.push(snippets[Math.floor(Math.random() * snippets.length)]);
        if (this.codeLines.length > 11) this.codeLines.shift();
      }

      for (let i = 0; i < this.codeLines.length; i++) {
        ctx.fillText(this.codeLines[i], 10, 32 + i * 11);
      }

      // Blinking cursor
      if (Math.floor(t * 4) % 2 === 0) {
        ctx.fillRect(10 + ctx.measureText(this.codeLines[this.codeLines.length - 1] || '').width, 32 + (this.codeLines.length - 1) * 11 - 8, 5, 9);
      }
    } else if (behavior === 'sleeping' || behavior === 'laying') {
      // ── Sleeping Mode: cozy night sky with Zzz... ──────────
      ctx.fillStyle = '#0b0f19'; // deep night dark blue
      ctx.fillRect(0, 0, w, h);

      // Draw a soft glowing yellow moon
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(w - 40, 40, 16, 0, Math.PI * 2);
      ctx.fill();

      // Moon bite (crescent)
      ctx.fillStyle = '#0b0f19';
      ctx.beginPath();
      ctx.arc(w - 46, 36, 16, 0, Math.PI * 2);
      ctx.fill();

      // Soft stars twinkling
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) {
        const starX = (Math.sin(i * 13 + t) * 0.5 + 0.5) * w;
        const starY = (Math.cos(i * 7 + t * 0.5) * 0.5 + 0.5) * (h - 40);
        const opacity = Math.abs(Math.sin(t * 2 + i));
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.fillRect(starX, starY, 1.5, 1.5);
      }

      // Floating Zzz
      ctx.fillStyle = '#93c5fd';
      ctx.font = 'bold 16px sans-serif';
      const zShift = (t * 15) % 80;
      const zScale = 10 + (zShift / 10);
      ctx.font = `bold ${zScale}px sans-serif`;
      ctx.fillText('Z', 40 + Math.sin(t) * 10, h - zShift);
      ctx.fillText('z', 60 + Math.cos(t) * 5, h - 15 - (zShift * 0.7));
    } else {
      // ── Idle/Default Mode: Calming Breathing Pace Guide ──────────
      ctx.fillStyle = '#0f172a'; // clean dark background
      ctx.fillRect(0, 0, w, h);

      // Resonant breathing cycle: 5.5s
      const cycle = (t % 5.5) / 5.5;
      const isInhale = cycle < 0.5;
      const pulse = Math.sin(cycle * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;

      // Draw glowing background ripple
      const grad = ctx.createRadialGradient(w/2, h/2, 10, w/2, h/2, 30 + pulse * 45);
      grad.addColorStop(0, 'rgba(251, 143, 179, 0.4)');
      grad.addColorStop(0.5, 'rgba(124, 131, 255, 0.15)');
      grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Draw central circle
      ctx.strokeStyle = '#ff8fb3';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w/2, h/2, 20 + pulse * 25, 0, Math.PI * 2);
      ctx.stroke();

      // Inner solid core
      ctx.fillStyle = 'rgba(255, 143, 179, 0.8)';
      ctx.beginPath();
      ctx.arc(w/2, h/2, 12 + pulse * 15, 0, Math.PI * 2);
      ctx.fill();

      // Text instruction
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(isInhale ? 'Inhale...' : 'Exhale...', w / 2, h / 2 + 5);

      // Subtitle
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px sans-serif';
      ctx.fillText('Breathing Pace Guide', w / 2, h - 18);
    }

    this.texture.needsUpdate = true;
  }
}

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
      handL: [0, 0, 0],
      hipL: [0, 0, 0],
      kneeL: [0, 0, 0],
      ankleL: [0, 0, 0],
      hipR: [0, 0, 0],
      kneeR: [0, 0, 0],
      ankleR: [0, 0, 0],
      skirt: [0, 0, 0]
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
          armEL: [d2r(75), d2r(10), d2r(45)],
          hipL: [d2r(-90), 0, Z],
          hipR: [d2r(-90), 0, Z],
          kneeL: [d2r(85), 0, Z],
          kneeR: [d2r(85), 0, Z],
          skirt: [d2r(-10), 0, Z]
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
          armEL: [d2r(20), 0, 0],
          hipL: [d2r(-15), 0, d2r(5)],
          hipR: [d2r(-10), 0, d2r(-5)],
          kneeL: [d2r(35), 0, 0],
          kneeR: [d2r(20), 0, 0]
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
          armEL: [d2r(35), 0, 0],
          hipL: [d2r(-20), 0, d2r(10)],
          hipR: [d2r(-12), 0, d2r(-5)],
          kneeL: [d2r(45), 0, 0],
          kneeR: [d2r(30), 0, 0]
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
        rot: base.rot,
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
          armEL: [d2r(15), 0, 0],
          hipL: [d2r(-35), 0, d2r(12)],
          hipR: [d2r(-25), 0, d2r(-12)],
          kneeL: [d2r(65), 0, 0],
          kneeR: [d2r(45), 0, 0]
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
          armEL: [d2r(85), 0, d2r(55)],
          hipL: [d2r(10), d2r(18), 0],
          hipR: [d2r(10), d2r(-18), 0],
          kneeL: [d2r(25), 0, 0],
          kneeR: [d2r(25), 0, 0]
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
    case 'idle':
    default:
      // Improved calm, relaxed and receptive seated posture
      return {
        rot: {
          ...base.rot,
          torso: [d2r(2), 0, d2r(-1)],
          head: [d2r(3), d2r(2), d2r(1)],
          armUR: [d2r(10), d2r(-5), d2r(-12)],
          armER: [d2r(68), 0, d2r(-15)],
          armUL: [d2r(10), d2r(5), d2r(12)],
          armEL: [d2r(68), 0, d2r(15)]
        },
        pos: base.pos,
        screen: d2r(100),
        laptopFallen: false
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

  // ── Resonant Deep Breathing ───────────────────────────────────────────────
  // Resonant deep breathing cycle (5.5 seconds, optimal for user relaxation)
  const breatheCycle = (t % 5.5) / 5.5;
  const breathePulse = Math.sin(breatheCycle * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;

  // Scale chest (torso) to simulate breathing chest expansion
  lily.joints.torso.scale.set(1 + breathePulse * 0.04, 1 + breathePulse * 0.025, 1 + breathePulse * 0.04);
  lily.joints.torso.position.y = lerp(lily.joints.torso.position.y, 0.1 + breathePulse * 0.018, k);

  // Subtle shoulder rising
  const armULRest = lily.restPos.armUL || new THREE.Vector3();
  const armURRest = lily.restPos.armUR || new THREE.Vector3();
  lily.joints.armUL.position.y = lerp(lily.joints.armUL.position.y, armULRest.y + breathePulse * 0.008, k);
  lily.joints.armUR.position.y = lerp(lily.joints.armUR.position.y, armURRest.y + breathePulse * 0.008, k);

  // Subtle head tilt (override base head rotation based on breathing)
  const targetHeadRotX = lily.target.head ? lily.target.head[0] : 0;
  lily.joints.head.rotation.x = lerp(lily.joints.head.rotation.x, targetHeadRotX - breathePulse * 0.025, k);

  if (lily.behavior === 'working') {
    // Sitting legs bend
    lily.joints.hipL.rotation.x = lerp(lily.joints.hipL.rotation.x, d2r(-90), 0.25);
    lily.joints.hipR.rotation.x = lerp(lily.joints.hipR.rotation.x, d2r(-90), 0.25);
    lily.joints.kneeL.rotation.x = lerp(lily.joints.kneeL.rotation.x, d2r(85), 0.25);
    lily.joints.kneeR.rotation.x = lerp(lily.joints.kneeR.rotation.x, d2r(85), 0.25);
    lily.joints.skirt.rotation.x = lerp(lily.joints.skirt.rotation.x, d2r(-10), 0.25);

    const jit = Math.sin(t * 14) * 0.06;
    lily.joints.handL.rotation.x = lerp(lily.joints.handL.rotation.x, jit, 0.5);
    lily.joints.handR.rotation.x = lerp(lily.joints.handR.rotation.x, -jit, 0.5);
    
    // Add micro head movements during typing
    lily.joints.head.rotation.z = lerp(lily.joints.head.rotation.z, Math.sin(t * 2) * 0.02, 0.2);
  }
  
  if (lily.behavior === 'walk') {
    const wave = Math.sin(t * 9);
    // swing legs out-of-phase
    lily.joints.hipL.rotation.x = lerp(lily.joints.hipL.rotation.x, wave * 0.42, 0.45);
    lily.joints.hipR.rotation.x = lerp(lily.joints.hipR.rotation.x, -wave * 0.42, 0.45);
    
    // bend knees during backswing
    lily.joints.kneeL.rotation.x = lerp(lily.joints.kneeL.rotation.x, wave < 0 ? -wave * 0.55 : 0.04, 0.45);
    lily.joints.kneeR.rotation.x = lerp(lily.joints.kneeR.rotation.x, wave > 0 ? wave * 0.55 : 0.04, 0.45);

    // swing skirt left/right and front/back
    lily.joints.skirt.rotation.z = lerp(lily.joints.skirt.rotation.z, Math.sin(t * 9) * 0.08, 0.4);
    lily.joints.skirt.rotation.x = lerp(lily.joints.skirt.rotation.x, Math.cos(t * 9) * 0.04, 0.4);

    const bob = Math.abs(Math.sin(t * 9)) * 0.04;
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

  // ── Active Listening Lookup & Face overrides ───────────────────────────────
  let targetEyeOpen = lily.eyeOpenTarget;
  let targetMouthOpen = lily.mouthOpenTarget;

  // Active listening lookup cycle: look up every 32 seconds for 4 seconds
  if ((lily.behavior === 'working' || lily.behavior === 'idle') && (t % 32 < 4)) {
    const cycleTime = t % 32;
    // Head tilts up/forward to make eye contact with the camera
    lily.joints.head.rotation.x = lerp(lily.joints.head.rotation.x, d2r(-10), k);
    lily.joints.head.rotation.y = lerp(lily.joints.head.rotation.y, 0, k);
    lily.joints.head.rotation.z = lerp(lily.joints.head.rotation.z, 0, k);
    
    // Squint warmly + smile
    if (cycleTime > 0.5 && cycleTime < 3.5) {
      targetEyeOpen = 0.6; // warm squint
      targetMouthOpen = 0.35; // gentle smile
    }
  }

  // face
  lily.eyeOpen = lerp(lily.eyeOpen, targetEyeOpen, k);
  lily.eyeL.scale.y = lily.eyeOpen;
  lily.eyeR.scale.y = lily.eyeOpen;
  lily.eyeL.scale.x = lerp(lily.eyeL.scale.x, lily.eyeOpen < 0.3 ? 1.6 : 1, k);
  lily.eyeR.scale.x = lerp(lily.eyeR.scale.x, lily.eyeOpen < 0.3 ? 1.6 : 1, k);
  
  lily.mouthOpen = lerp(
    lily.mouthOpen,
    targetMouthOpen + (lily.lipSync ? Math.abs(Math.sin(t * 18)) * 0.8 : 0),
    0.5
  );
  lily.mouth.scale.set(1, 1, lily.mouthOpen * 3 + 0.2);
  lily.mouth.position.y = lerp(lily.mouth.position.y, 0.04 - lily.mouthOpen * 0.02, 0.3);
  
  lily.darkVis = lerp(lily.darkVis, lily.darkVisTarget, k);
  lily.darkL.visible = lily.darkVis > 0.02;
  lily.darkR.visible = lily.darkVis > 0.02;
  (lily.darkL.material as THREE.MeshStandardMaterial).opacity = lily.darkVis;
  (lily.darkL.material as THREE.MeshStandardMaterial).transparent = true;
  (lily.darkR.material as THREE.MeshStandardMaterial).opacity = lily.darkVis;
  (lily.darkR.material as THREE.MeshStandardMaterial).transparent = true;

  // ── Laptop Screen Texture Animation ────────────────────────────────────────
  if (lily.animator) {
    lily.animator.update(lily.behavior, t, dt);
  }
}
