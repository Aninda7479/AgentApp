import * as THREE from 'three';
import { d2r } from './animations';

/**
 * Materials.
 *
 * Kept intentionally PBR-soft so the ACES tone-mapping + RoomEnvironment in the
 * renderer give the character a "toon-shaded but real" look rather than the old
 * flat-plastic box model. Skin is a warm anime peach, hair a soft cocoa, the
 * dress + skirt a vivid anime red, underwear a clean off-white.
 */
export function makeMat(color: string, rough = 0.6, metal = 0.05) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: rough,
    metalness: metal,
    envMapIntensity: 1.15
  });
}

// ── Shared palette ────────────────────────────────────────────────────────────
const SKIN = '#ffe2d0';
const HAIR = '#8a5a3c';
const DRESS = '#e23a4e'; // bodice red
const SKIRT = '#ef4f66'; // skirt red (a touch lighter for layering depth)
const UNDER = '#fbf3ef'; // white underwear
const SHOE = '#b32d44'; // red shoes (matches the dress)
const IRIS = '#2f8fd0'; // bright anime-blue eyes

// The renderer sizes the character assuming an intrinsic ~2.2-unit tall model.
// We build at a comfortable natural scale and wrap everything in one group that
// we scale up to hit that height, so the pet fills the window exactly like the
// original did.
const MODEL_SCALE = 1.45;

export function buildLilyGeometry(lily: any, accent: string): void {
  lily.skinMat = makeMat(SKIN, 0.55, 0.0);
  lily.clothMat = makeMat(DRESS, 0.72, 0.0);
  lily.hairMat = makeMat(HAIR, 0.85, 0.0);
  const skirtMat = makeMat(SKIRT, 0.72, 0.0);
  const underMat = makeMat(UNDER, 0.6, 0.0);
  const shoeMat = makeMat(SHOE, 0.5, 0.0);
  const accentMat = makeMat(accent || '#ff8fb3', 0.7, 0.0);

  const g = lily.object;

  // Everything lives under one scaled group so the final height matches what the
  // renderer expects (see MODEL_SCALE).
  const body = new THREE.Group();
  body.scale.setScalar(MODEL_SCALE);
  g.add(body);

  // ── Pelvis (root of the body) ───────────────────────────────────────────────
  const pelvis = new THREE.Group();
  body.add(pelvis);
  lily.joints.pelvis = pelvis;

  // ── Torso (dress bodice) ────────────────────────────────────────────────────
  const torso = new THREE.Group();
  torso.position.y = 0.1;
  pelvis.add(torso);
  lily.joints.torso = torso;

  // Red dress bodice — a gently tapered, smooth cylinder (no more boxes).
  const bodice = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.165, 0.42, 28),
    lily.clothMat
  );
  bodice.position.y = 0.05;
  torso.add(bodice);

  // Soft rounded shoulders so the arms read as coming out of the dress.
  for (const sx of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 16), lily.clothMat);
    sh.position.set(sx * 0.135, 0.33, 0);
    sh.scale.set(1, 0.8, 0.9);
    torso.add(sh);
  }

  // Neck (skin) connecting bodice to head.
  const neckMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.14, 6, 16), lily.skinMat);
  neckMesh.position.y = 0.41;
  torso.add(neckMesh);

  // ── Head joint ──────────────────────────────────────────────────────────────
  const neck = new THREE.Group();
  neck.position.y = 0.42;
  torso.add(neck);
  lily.joints.head = neck;

  // Smooth round face (a softly squashed sphere).
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 28), lily.skinMat);
  headMesh.position.y = 0.15;
  headMesh.scale.set(1, 1.06, 0.95);
  neck.add(headMesh);

  // Small rounded ears.
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 12), lily.skinMat);
    ear.position.set(sx * 0.145, 0.14, -0.02);
    ear.scale.set(0.7, 1, 0.6);
    neck.add(ear);
  }

  // ── Hair ───────────────────────────────────────────────────────────────────
  // Back + crown mass: a full sphere pushed slightly back so it never covers the
  // face, only frames it.
  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.17, 28, 24), lily.hairMat);
  hairBack.position.set(0, 0.17, -0.05);
  neck.add(hairBack);

  // Bangs: a front-facing top-hemisphere shell that caps the forehead and stops
  // just above the eyes — leaving a clean face "window" for the features. In
  // THREE's sphere param, phi = π/2 points to +Z (front), so we center the
  // covered arc there and leave the ~0.3π gap at the back (covered by hairBack).
  const bangs = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.17,
      28,
      18,
      Math.PI * 1.65, // start past the side, sweeping across the front
      Math.PI * 1.7, // leave a ~0.3π gap at the very back
      0,
      Math.PI * 0.5 // only the top half → bottom edge sits at the forehead
    ),
    lily.hairMat
  );
  bangs.position.set(0, 0.15, 0.005);
  neck.add(bangs);

  // Side locks framing the face.
  for (const sx of [-1, 1]) {
    const lock = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.2, 6, 14), lily.hairMat);
    lock.position.set(sx * 0.135, 0.06, 0.04);
    lock.scale.set(1, 1, 0.7);
    neck.add(lock);
  }

  // A short back tail for anime flair.
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.16, 6, 14), lily.hairMat);
  tail.position.set(0, 0.02, -0.16);
  tail.rotation.x = d2r(12);
  neck.add(tail);

  // Cute hair bow (uses the partner accent color) at the back of the head.
  const bow = new THREE.Group();
  bow.position.set(0, 0.3, -0.11);
  for (const sx of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 12), accentMat);
    loop.position.set(sx * 0.055, 0, 0);
    loop.scale.set(1.1, 0.7, 0.4);
    bow.add(loop);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 12), accentMat);
  bow.add(knot);
  neck.add(bow);

  // ── Face details ─────────────────────────────────────────────────────────────
  const buildEye = (): THREE.Group => {
    const eye = new THREE.Group();

    const sclera = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0xfdfdff, roughness: 0.35 })
    );
    sclera.scale.set(1, 1.3, 0.5);
    eye.add(sclera);

    const iris = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 22, 22),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(IRIS),
        roughness: 0.22,
        emissive: new THREE.Color('#123a5a'),
        emissiveIntensity: 0.45
      })
    );
    iris.scale.set(1, 1.3, 0.45);
    iris.position.z = 0.022;
    eye.add(iris);

    const pupil = new THREE.Mesh(
      new THREE.CircleGeometry(0.017, 20),
      new THREE.MeshBasicMaterial({ color: 0x0a0d14 })
    );
    pupil.position.z = 0.035;
    eye.add(pupil);

    const hi = new THREE.Mesh(
      new THREE.CircleGeometry(0.014, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    hi.position.set(-0.013, 0.015, 0.037);
    eye.add(hi);

    const hi2 = new THREE.Mesh(
      new THREE.CircleGeometry(0.006, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
    );
    hi2.position.set(0.015, -0.013, 0.036);
    eye.add(hi2);

    return eye;
  };

  lily.eyeL = buildEye();
  lily.eyeL.position.set(-0.062, 0.12, 0.155);
  neck.add(lily.eyeL);

  lily.eyeR = buildEye();
  lily.eyeR.position.set(0.062, 0.12, 0.155);
  neck.add(lily.eyeR);

  // Eyebrows (subtle).
  for (const sx of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.02), lily.hairMat);
    brow.position.set(sx * 0.062, 0.19, 0.155);
    brow.rotation.z = sx * d2r(8);
    neck.add(brow);
  }

  // Blush (soft, translucent).
  for (const sx of [-1, 1]) {
    const blush = new THREE.Mesh(
      new THREE.CircleGeometry(0.028, 18),
      new THREE.MeshBasicMaterial({ color: 0xff9bb0, transparent: true, opacity: 0.5 })
    );
    blush.position.set(sx * 0.1, 0.08, 0.142);
    blush.rotation.y = sx * d2r(18);
    neck.add(blush);
  }

  // Dark circles (tired look) — hidden unless darkCircles is enabled.
  const darkGeo = new THREE.BoxGeometry(0.06, 0.018, 0.005);
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x6a4a6a, transparent: true, opacity: 0 });
  lily.darkL = new THREE.Mesh(darkGeo, darkMat);
  lily.darkL.position.set(-0.062, 0.07, 0.162);
  lily.darkL.visible = false;
  lily.darkL.scale.set(1.3, 0.7, 0.4);
  neck.add(lily.darkL);

  lily.darkR = lily.darkL.clone() as THREE.Mesh;
  lily.darkR.position.x = 0.062;
  neck.add(lily.darkR);

  // Mouth (child of head/neck; y is driven by the animation).
  lily.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 14), makeMat('#d96b7a', 0.5));
  lily.mouth.position.set(0, 0.04, 0.12);
  lily.mouth.scale.set(1.2, 0.7, 1);
  neck.add(lily.mouth);

  // ── Arms (shoulder → elbow → hand) ──────────────────────────────────────────
  const buildArm = (side: number, upperStore: string, lowerStore: string, handStore: string) => {
    const upper = new THREE.Group();
    upper.position.set(side * 0.18, 0.35, 0);
    torso.add(upper);
    lily.joints[upperStore] = upper;

    // Puffy red sleeve over the upper arm.
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.13, 6, 16), lily.clothMat);
    sleeve.position.y = -0.1;
    sleeve.scale.set(1, 1, 0.9);
    upper.add(sleeve);

    const lower = new THREE.Group();
    lower.position.y = -0.22;
    upper.add(lower);
    lily.joints[lowerStore] = lower;

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 6, 16), lily.skinMat);
    forearm.position.y = -0.1;
    lower.add(forearm);

    const hand = new THREE.Group();
    hand.position.y = -0.2;
    lower.add(hand);
    lily.joints[handStore] = hand;

    const handMesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 14), lily.skinMat);
    handMesh.scale.set(0.9, 1, 0.7);
    hand.add(handMesh);
  };

  buildArm(-1, 'armUL', 'armEL', 'handL');
  buildArm(1, 'armUR', 'armER', 'handR');

  // ── Skirt Joint Group (for flowing fabric sways) ───────────────────────────
  const skirtGroup = new THREE.Group();
  skirtGroup.position.set(0, -0.06, 0);
  pelvis.add(skirtGroup);
  lily.joints.skirt = skirtGroup;

  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.34, 0.32, 30, 1, false),
    skirtMat
  );
  skirt.position.set(0, 0, 0);
  skirtGroup.add(skirt);

  // ── Articulated Legs (Hip -> Knee -> Ankle/Foot hierarchy) ──────────────────
  for (const sx of [-1, 1]) {
    const side = sx === -1 ? 'L' : 'R';

    // Hip joint (under pelvis)
    const hip = new THREE.Group();
    hip.position.set(sx * 0.08, -0.1, 0);
    pelvis.add(hip);
    lily.joints[`hip${side}`] = hip;

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 6, 16), lily.skinMat);
    thigh.position.y = -0.1;
    hip.add(thigh);

    // Knee joint (under hip)
    const knee = new THREE.Group();
    knee.position.set(0, -0.22, 0);
    hip.add(knee);
    lily.joints[`knee${side}`] = knee;

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.2, 6, 16), lily.skinMat);
    shin.position.y = -0.1;
    knee.add(shin);

    // White sock
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.1, 16), underMat);
    sock.position.y = -0.2;
    knee.add(sock);

    // Ankle/Foot joint (under knee)
    const ankle = new THREE.Group();
    ankle.position.set(0, -0.26, 0);
    knee.add(ankle);
    lily.joints[`ankle${side}`] = ankle;

    // Red shoe
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.2), shoeMat);
    shoe.position.set(0, 0, 0.05); // slightly forward
    shoe.geometry.translate(0, 0, 0.02);
    ankle.add(shoe);
  }

  // ── White underwear (bloomer-style, peeks out just below the skirt hem) ─────
  const underwear = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.14, 0.32, 24, 1, false),
    underMat
  );
  underwear.position.set(0, -0.1, 0.01);
  underwear.scale.set(1, 1, 0.85);
  pelvis.add(underwear);

  // ── Props: Laptop (base + screen) ───────────────────────────────────────────
  lily.laptop = new THREE.Group();
  lily.laptop.position.set(0, -0.16, 0.26);
  pelvis.add(lily.laptop);
  lily.joints.laptop = lily.laptop;

  const lapBase = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.02, 0.26), makeMat('#cfd6e6', 0.4, 0.3));
  lily.laptop.add(lapBase);

  lily.laptopScreen = new THREE.Group();
  lily.laptopScreen.position.set(0, 0.01, -0.13);
  lily.laptopScreen.rotation.x = d2r(100);
  lily.laptop.add(lily.laptopScreen);

  const screenLid = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.26, 0.015), makeMat('#2e2e38', 0.4, 0.3));
  screenLid.position.y = 0.13;
  lily.laptopScreen.add(screenLid);

  const displayGeo = new THREE.PlaneGeometry(0.36, 0.24);
  const displayMat = new THREE.MeshBasicMaterial({ map: lily.animator.texture });
  const display = new THREE.Mesh(displayGeo, displayMat);
  display.position.set(0, 0.13, 0.009);
  lily.laptopScreen.add(display);

  // ── Props: Pillow ───────────────────────────────────────────────────────────
  lily.pillow = new THREE.Group();
  lily.pillow.position.set(0.05, 0.4, -0.22);
  torso.add(lily.pillow);
  lily.joints.pillow = lily.pillow;

  const pillowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.24), makeMat('#ffe8ed', 0.95));
  pillowMesh.rotation.set(d2r(15), d2r(-10), d2r(5));
  lily.pillow.add(pillowMesh);

  // ── Tag parts for poke raycasting ────────────────────────────────────────────
  pelvis.userData = { part: 'pelvis' };
  torso.userData = { part: 'torso' };
  neck.userData = { part: 'head' };
  (lily.joints.armUR as THREE.Object3D).userData = { part: 'arm' };
  (lily.joints.armUL as THREE.Object3D).userData = { part: 'arm' };
}

export function applyLilyRest(lily: any): void {
  lily.object.traverse((o: any) => {
    if (o instanceof THREE.Group && o.name) {
      lily.restPos[o.name] = o.position.clone();
    }
  });
  // Hardcode fallback rest positions for joints that aren't named in the scene graph
  for (const name in lily.joints) {
    lily.restPos[name] = lily.joints[name].position.clone();
  }
}
