import * as THREE from 'three';
import { d2r } from './animations';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Materials.
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
const DRESS = '#e23a4e';
const SKIRT = '#ef4f66';
const UNDER = '#fbf3ef';
const SHOE = '#b32d44';
const IRIS = '#2f8fd0';

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

  // List of procedural body meshes to hide if GLB loads successfully
  const meshesToHide: THREE.Mesh[] = [];

  // Scaling group to fit height
  const body = new THREE.Group();
  body.scale.setScalar(MODEL_SCALE);
  g.add(body);

  // ── Pelvis ──────────────────────────────────────────────────────────────────
  const pelvis = new THREE.Group();
  body.add(pelvis);
  lily.joints.pelvis = pelvis;

  // ── Torso ───────────────────────────────────────────────────────────────────
  const torso = new THREE.Group();
  torso.position.y = 0.1;
  pelvis.add(torso);
  lily.joints.torso = torso;

  // Red dress bodice
  const bodice = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.165, 0.42, 28),
    lily.clothMat
  );
  bodice.position.y = 0.05;
  torso.add(bodice);
  meshesToHide.push(bodice);

  // White apron top layer
  const apron = new THREE.Mesh(
    new THREE.CylinderGeometry(0.132, 0.167, 0.3, 28),
    underMat
  );
  apron.position.set(0, -0.01, 0.002);
  apron.scale.set(1.02, 1.02, 1.02);
  torso.add(apron);
  meshesToHide.push(apron);

  // White frilly collar
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.04, 20), underMat);
  collar.position.y = 0.25;
  torso.add(collar);
  meshesToHide.push(collar);

  // Front ribbon bow
  const chestBow = new THREE.Group();
  chestBow.position.set(0, 0.2, 0.15);
  chestBow.rotation.x = d2r(10);
  for (const sx of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), accentMat);
    loop.position.set(sx * 0.03, 0, 0);
    loop.scale.set(1.2, 0.7, 0.4);
    chestBow.add(loop);
    meshesToHide.push(loop);
  }
  const chestKnot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), accentMat);
  chestBow.add(chestKnot);
  torso.add(chestBow);
  meshesToHide.push(chestKnot);

  // Soft shoulders
  for (const sx of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 16), lily.clothMat);
    sh.position.set(sx * 0.135, 0.22, 0);
    sh.scale.set(1, 0.8, 0.9);
    torso.add(sh);
    meshesToHide.push(sh);
  }

  // Neck (skin)
  const neckMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.14, 6, 16), lily.skinMat);
  neckMesh.position.y = 0.29;
  torso.add(neckMesh);
  meshesToHide.push(neckMesh);

  // ── Head joint ──────────────────────────────────────────────────────────────
  const neck = new THREE.Group();
  neck.position.y = 0.3;
  torso.add(neck);
  lily.joints.head = neck;

  // Face sphere
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 28), lily.skinMat);
  headMesh.position.y = 0.15;
  headMesh.scale.set(1, 1.06, 0.95);
  neck.add(headMesh);
  meshesToHide.push(headMesh);

  // Ears
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 12), lily.skinMat);
    ear.position.set(sx * 0.145, 0.14, -0.02);
    ear.scale.set(0.7, 1, 0.6);
    neck.add(ear);
    meshesToHide.push(ear);
  }

  // ── Hair ───────────────────────────────────────────────────────────────────
  // Back hair
  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.17, 28, 24), lily.hairMat);
  hairBack.position.set(0, 0.17, -0.05);
  neck.add(hairBack);
  meshesToHide.push(hairBack);

  // Bangs
  const bangs = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.17,
      28,
      18,
      Math.PI * 1.65,
      Math.PI * 1.7,
      0,
      Math.PI * 0.5
    ),
    lily.hairMat
  );
  bangs.position.set(0, 0.15, 0.005);
  neck.add(bangs);
  meshesToHide.push(bangs);

  // Side locks
  for (const sx of [-1, 1]) {
    const lock = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.2, 6, 14), lily.hairMat);
    lock.position.set(sx * 0.135, 0.06, 0.04);
    lock.scale.set(1, 1, 0.7);
    neck.add(lock);
    meshesToHide.push(lock);
  }

  // Short back tail
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.16, 6, 14), lily.hairMat);
  tail.position.set(0, 0.02, -0.16);
  tail.rotation.x = d2r(12);
  neck.add(tail);
  meshesToHide.push(tail);

  // Large hair bow
  const bow = new THREE.Group();
  bow.position.set(0, 0.3, -0.11);
  for (const sx of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 12), accentMat);
    loop.position.set(sx * 0.055, 0, 0);
    loop.scale.set(1.1, 0.7, 0.4);
    bow.add(loop);
    meshesToHide.push(loop);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 12), accentMat);
  bow.add(knot);
  neck.add(bow);
  meshesToHide.push(knot);

  // Twintails!
  for (const sx of [-1, 1]) {
    const side = sx === -1 ? 'L' : 'R';
    
    // Hair tie cylinder
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 12), accentMat);
    tie.position.set(sx * 0.14, 0.22, -0.06);
    tie.rotation.z = -sx * d2r(25);
    neck.add(tie);
    meshesToHide.push(tie);

    // Group for dynamic rotation/sway
    const tailGroup = new THREE.Group();
    tailGroup.position.set(sx * 0.14, 0.22, -0.06);
    neck.add(tailGroup);
    lily.joints[`hairTail${side}`] = tailGroup;

    // Outer long hair tail strand
    const strand1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.32, 6, 16), lily.hairMat);
    strand1.position.set(sx * 0.02, -0.16, 0.01);
    strand1.rotation.z = -sx * d2r(12);
    tailGroup.add(strand1);
    meshesToHide.push(strand1);

    // Inner shorter lock strand
    const strand2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.2, 4, 12), lily.hairMat);
    strand2.position.set(-sx * 0.02, -0.1, 0.03);
    strand2.rotation.z = -sx * d2r(5);
    tailGroup.add(strand2);
    meshesToHide.push(strand2);
  }

  // Developer headphones (always visible overlay)
  const bandGeo = new THREE.TorusGeometry(0.165, 0.016, 12, 40, Math.PI);
  const band = new THREE.Mesh(bandGeo, makeMat('#334155', 0.5));
  band.position.set(0, 0.18, 0);
  band.rotation.x = d2r(5);
  neck.add(band);

  for (const sx of [-1, 1]) {
    const padGroup = new THREE.Group();
    padGroup.position.set(sx * 0.155, 0.14, 0);
    padGroup.rotation.y = sx * d2r(5);
    
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.024, 16), accentMat);
    cap.rotation.z = d2r(90);
    padGroup.add(cap);

    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.016, 16), makeMat('#1e293b', 0.8));
    cushion.position.x = -sx * 0.015;
    cushion.rotation.z = d2r(90);
    padGroup.add(cushion);

    neck.add(padGroup);
  }

  // Eyelashes (drawn on top of both procedural face and GLB)
  for (const sx of [-1, 1]) {
    const lashGroup = new THREE.Group();
    lashGroup.position.set(sx * 0.062, 0.165, 0.155);
    
    const lash1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.045, 4, 8), lily.hairMat);
    lash1.rotation.z = sx * d2r(65);
    lashGroup.add(lash1);

    const lash2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.025, 4, 8), lily.hairMat);
    lash2.position.set(sx * 0.025, 0.01, 0.005);
    lash2.rotation.z = sx * d2r(35);
    lashGroup.add(lash2);

    neck.add(lashGroup);
  }

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

    const starGroup = new THREE.Group();
    starGroup.position.set(0.014, 0.015, 0.037);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    const starBar1 = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.005, 0.002), starMat);
    starBar1.rotation.z = d2r(45);
    starGroup.add(starBar1);
    
    const starBar2 = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.016, 0.002), starMat);
    starBar2.rotation.z = d2r(45);
    starGroup.add(starBar2);
    
    eye.add(starGroup);

    const hi2 = new THREE.Mesh(
      new THREE.CircleGeometry(0.006, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
    );
    hi2.position.set(-0.015, -0.013, 0.036);
    eye.add(hi2);

    return eye;
  };

  lily.eyeL = buildEye();
  lily.eyeL.position.set(-0.062, 0.12, 0.155);
  neck.add(lily.eyeL);

  lily.eyeR = buildEye();
  lily.eyeR.position.set(0.062, 0.12, 0.155);
  neck.add(lily.eyeR);

  // Eyebrows
  for (const sx of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.02), lily.hairMat);
    brow.position.set(sx * 0.062, 0.19, 0.155);
    brow.rotation.z = sx * d2r(8);
    neck.add(brow);
  }

  // Blush circles
  for (const sx of [-1, 1]) {
    const blush = new THREE.Mesh(
      new THREE.CircleGeometry(0.028, 18),
      new THREE.MeshBasicMaterial({ color: 0xff9bb0, transparent: true, opacity: 0.5 })
    );
    blush.position.set(sx * 0.1, 0.08, 0.142);
    blush.rotation.y = sx * d2r(18);
    neck.add(blush);
  }

  // Dark circles
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

  // Mouth
  lily.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 14), makeMat('#d96b7a', 0.5));
  lily.mouth.position.set(0, 0.04, 0.12);
  lily.mouth.scale.set(1.2, 0.7, 1);
  neck.add(lily.mouth);

  // Sleeping mask
  const sleepMask = new THREE.Group();
  sleepMask.position.set(0, 0.125, 0.148);
  const maskPlate = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.14, 6, 16), accentMat);
  maskPlate.rotation.z = d2r(90);
  maskPlate.scale.set(1.1, 1.1, 0.35);
  sleepMask.add(maskPlate);

  for (const sx of [-1, 1]) {
    const stitch = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.028, 4, 8), makeMat('#ffffff', 0.8));
    stitch.position.set(sx * 0.035, -0.004, 0.008);
    stitch.rotation.z = sx * d2r(25);
    sleepMask.add(stitch);
  }
  neck.add(sleepMask);
  lily.sleepMask = sleepMask;
  lily.sleepMask.visible = false;

  // ── Arms (shoulder → elbow → hand) ──────────────────────────────────────────
  const buildArm = (side: number, upperStore: string, lowerStore: string, handStore: string) => {
    const upper = new THREE.Group();
    upper.position.set(side * 0.18, 0.22, 0);
    torso.add(upper);
    lily.joints[upperStore] = upper;

    // Puffy red sleeve
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.13, 6, 16), lily.clothMat);
    sleeve.position.y = -0.08;
    sleeve.scale.set(1, 1, 0.9);
    upper.add(sleeve);
    meshesToHide.push(sleeve);

    const lower = new THREE.Group();
    lower.position.y = -0.2;
    upper.add(lower);
    lily.joints[lowerStore] = lower;

    // Forearm skin
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 6, 16), lily.skinMat);
    forearm.position.y = -0.08;
    lower.add(forearm);
    meshesToHide.push(forearm);

    // Cuffs
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 16), underMat);
    cuff.position.y = -0.15;
    lower.add(cuff);
    meshesToHide.push(cuff);

    const hand = new THREE.Group();
    hand.position.y = -0.18;
    lower.add(hand);
    lily.joints[handStore] = hand;

    const handMesh = new THREE.Mesh(new THREE.SphereGeometry(0.046, 16, 14), lily.skinMat);
    handMesh.scale.set(0.9, 1, 0.7);
    hand.add(handMesh);
    meshesToHide.push(handMesh);
  };

  buildArm(-1, 'armUL', 'armEL', 'handL');
  buildArm(1, 'armUR', 'armER', 'handR');

  // ── Skirt Joint Group ───────────────────────────────────────────────────────
  const skirtGroup = new THREE.Group();
  skirtGroup.position.set(0, -0.12, 0);
  pelvis.add(skirtGroup);
  lily.joints.skirt = skirtGroup;

  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.34, 0.32, 30, 1, false),
    skirtMat
  );
  skirt.position.set(0, 0, 0);
  skirtGroup.add(skirt);
  meshesToHide.push(skirt);

  // White apron skirt overlay
  const apronSkirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.152, 0.31, 0.22, 30, 1, false),
    underMat
  );
  apronSkirt.position.set(0, 0.04, 0.005);
  apronSkirt.scale.set(1.02, 1.02, 1.02);
  skirtGroup.add(apronSkirt);
  meshesToHide.push(apronSkirt);

  // ── Articulated Legs ────────────────────────────────────────────────────────
  for (const sx of [-1, 1]) {
    const side = sx === -1 ? 'L' : 'R';

    const hip = new THREE.Group();
    hip.position.set(sx * 0.08, -0.1, 0);
    pelvis.add(hip);
    lily.joints[`hip${side}`] = hip;

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 6, 16), lily.skinMat);
    thigh.position.y = -0.1;
    hip.add(thigh);
    meshesToHide.push(thigh);

    const knee = new THREE.Group();
    knee.position.set(0, -0.22, 0);
    hip.add(knee);
    lily.joints[`knee${side}`] = knee;

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.2, 6, 16), lily.skinMat);
    shin.position.y = -0.1;
    knee.add(shin);
    meshesToHide.push(shin);

    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.1, 16), underMat);
    sock.position.y = -0.2;
    knee.add(sock);
    meshesToHide.push(sock);

    const ankle = new THREE.Group();
    ankle.position.set(0, -0.26, 0);
    knee.add(ankle);
    lily.joints[`ankle${side}`] = ankle;

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.2), shoeMat);
    shoe.position.set(0, 0, 0.05);
    shoe.geometry.translate(0, 0, 0.02);
    ankle.add(shoe);
    meshesToHide.push(shoe);
  }

  // Underwear (bloomer-style)
  const underwear = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.14, 0.32, 24, 1, false),
    underMat
  );
  underwear.position.set(0, -0.1, 0.01);
  underwear.scale.set(1, 1, 0.85);
  pelvis.add(underwear);
  meshesToHide.push(underwear);

  // ── Props: Laptop ───────────────────────────────────────────────────────────
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

  // Developer stickers on laptop lid
  const stReact = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.005), makeMat('#00d8ff', 0.5));
  stReact.position.set(-0.09, 0.14, -0.01);
  stReact.rotation.y = Math.PI;
  stReact.rotation.z = d2r(15);
  screenLid.add(stReact);

  const stRust = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.005), makeMat('#e05a36', 0.5));
  stRust.position.set(0.08, 0.15, -0.01);
  stRust.rotation.y = Math.PI;
  stRust.rotation.z = d2r(-10);
  screenLid.add(stRust);

  const stHeart = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.005), accentMat);
  stHeart.position.set(0, 0.06, -0.01);
  stHeart.rotation.y = Math.PI;
  screenLid.add(stHeart);

  const displayGeo = new THREE.PlaneGeometry(0.36, 0.24);
  const displayMat = new THREE.MeshBasicMaterial({ map: lily.animator.texture });
  const display = new THREE.Mesh(displayGeo, displayMat);
  display.position.set(0, 0.13, 0.009);
  lily.laptopScreen.add(display);

  // ── Props: Fluffy Pillow ───────────────────────────────────────────────────
  lily.pillow = new THREE.Group();
  lily.pillow.position.set(0.05, 0.4, -0.22);
  torso.add(lily.pillow);
  lily.joints.pillow = lily.pillow;

  const pillowMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 20), makeMat('#ffe8ed', 0.9));
  pillowMesh.scale.set(1.4, 0.7, 1.15);
  pillowMesh.rotation.set(d2r(15), d2r(-10), d2r(5));
  lily.pillow.add(pillowMesh);

  // ── Tag parts for raycast pokes ──────────────────────────────────────────────
  pelvis.userData = { part: 'pelvis' };
  torso.userData = { part: 'torso' };
  neck.userData = { part: 'head' };
  (lily.joints.armUR as THREE.Object3D).userData = { part: 'arm' };
  (lily.joints.armUL as THREE.Object3D).userData = { part: 'arm' };

  // ── Load smooth GLB mesh file (Asynchronous) ──────────────────────────────
  try {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    const glbUrl = './models/lily/v1/girl_web.glb';
    loader.load(glbUrl, (gltf) => {
      const model = gltf.scene;

      // Fit to pelvis scale and position
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const targetHeight = 1.34;
      const scale = targetHeight / maxDim;
      model.scale.setScalar(scale);

      // Align model center with pelvis/torso center
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.set(-center.x * scale, -center.y * scale + 0.65, -center.z * scale - 0.05);

      model.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material.roughness = 0.68;
            child.material.metalness = 0.05;
          }
        }
      });

      // Add to pelvis so it tilts, breathes, and sways with the companion body
      pelvis.add(model);

      // Hide the blocky procedural body parts now that smooth model is successfully loaded
      meshesToHide.forEach((m) => {
        m.visible = false;
      });

      console.log('[pet] Loaded smooth girl_web.glb successfully. Swapped blocky procedural meshes.');
    }, undefined, (err) => {
      console.warn('[pet] Failed to load smooth girl_web.glb, fell back to high-quality procedural body.', err);
    });
  } catch (err) {
    console.warn('[pet] GLTFLoader error, fell back to high-quality procedural body.', err);
  }
}

export function applyLilyRest(lily: any): void {
  lily.object.traverse((o: any) => {
    if (o instanceof THREE.Group && o.name) {
      lily.restPos[o.name] = o.position.clone();
    }
  });
  for (const name in lily.joints) {
    lily.restPos[name] = lily.joints[name].position.clone();
  }
}
