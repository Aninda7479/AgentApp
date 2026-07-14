import * as THREE from 'three';
import { d2r } from './animations';

export function makeMat(color: string, rough = 0.6, metal = 0.05) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: rough,
    metalness: metal,
    envMapIntensity: 1.1
  });
}

export function buildLilyGeometry(lily: any, accent: string): void {
  lily.skinMat = makeMat('#f6cdb0', 0.7);
  lily.clothMat = makeMat(accent || '#ff8fb3', 0.8);
  lily.hairMat = makeMat('#3a2b4d', 0.85);

  const g = lily.object;

  // Pelvis (root of the body)
  const pelvis = new THREE.Group();
  g.add(pelvis);
  lily.joints.pelvis = pelvis;

  // Torso
  const torso = new THREE.Group();
  torso.position.y = 0.1;
  pelvis.add(torso);
  lily.joints.torso = torso;

  const chestGeo = new THREE.BoxGeometry(0.32, 0.42, 0.22);
  const chest = new THREE.Mesh(chestGeo, lily.clothMat);
  chest.position.y = 0.21;
  chest.scale.set(1.1, 0.7, 0.5);
  torso.add(chest);

  // Head joint
  const neck = new THREE.Group();
  neck.position.y = 0.42;
  torso.add(neck);
  lily.joints.head = neck;

  const headGeo = new THREE.BoxGeometry(0.28, 0.28, 0.26);
  const head = new THREE.Mesh(headGeo, lily.skinMat);
  head.position.y = 0.14;
  neck.add(head);

  // Hair back
  const hbGeo = new THREE.BoxGeometry(0.3, 0.32, 0.1);
  const hairBack = new THREE.Mesh(hbGeo, lily.hairMat);
  hairBack.position.set(0, 0.15, -0.1);
  hairBack.scale.set(1, 1.05, 0.8);
  neck.add(hairBack);

  // Hair bangs
  const hfGeo = new THREE.BoxGeometry(0.3, 0.08, 0.06);
  const hairBangs = new THREE.Mesh(hfGeo, lily.hairMat);
  hairBangs.position.set(0, 0.27, 0.11);
  neck.add(hairBangs);

  // Face details
  const eyeGeo = new THREE.BoxGeometry(0.05, 0.05, 0.01);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x221133 });
  lily.eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  lily.eyeL.position.set(-0.06, 0.14, 0.131);
  neck.add(lily.eyeL);

  lily.eyeR = lily.eyeL.clone() as THREE.Mesh;
  lily.eyeR.position.x = 0.06;
  neck.add(lily.eyeR);

  // Dark circles (tired look)
  const darkGeo = new THREE.BoxGeometry(0.06, 0.015, 0.005);
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x5a4d75, transparent: true, opacity: 0 });
  lily.darkL = new THREE.Mesh(darkGeo, darkMat);
  lily.darkL.position.set(-0.06, 0.09, 0.132);
  lily.darkL.visible = false;
  lily.darkL.scale.set(1.4, 0.7, 0.4);
  neck.add(lily.darkL);

  lily.darkR = lily.darkL.clone() as THREE.Mesh;
  lily.darkR.position.x = 0.06;
  neck.add(lily.darkR);

  // Mouth
  const mouthGeo = new THREE.BoxGeometry(0.04, 0.015, 0.02);
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0xd95b76 });
  lily.mouth = new THREE.Mesh(mouthGeo, mouthMat);
  lily.mouth.position.set(0, -0.13, 0.131);
  lily.mouth.scale.set(1, 1, 0.2);
  head.add(lily.mouth);

  // Right Arm (ArmUR -> ArmER -> HandR)
  const armUR = new THREE.Group();
  armUR.position.set(0.18, 0.35, 0);
  torso.add(armUR);
  lily.joints.armUR = armUR;

  const upperR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.09), lily.clothMat);
  upperR.position.y = -0.11;
  armUR.add(upperR);

  const armER = new THREE.Group();
  armER.position.y = -0.22;
  armUR.add(armER);
  lily.joints.armER = armER;

  const lowerR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), lily.skinMat);
  lowerR.position.y = -0.1;
  armER.add(lowerR);

  const handR = new THREE.Group();
  handR.position.y = -0.2;
  armER.add(handR);
  lily.joints.handR = handR;

  // Left Arm (ArmUL -> ArmEL -> HandL)
  const armUL = new THREE.Group();
  armUL.position.set(-0.18, 0.35, 0);
  torso.add(armUL);
  lily.joints.armUL = armUL;

  const upperL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.09), lily.clothMat);
  upperL.position.y = -0.11;
  armUL.add(upperL);

  const armEL = new THREE.Group();
  armEL.position.y = -0.22;
  armUL.add(armEL);
  lily.joints.armEL = armEL;

  const lowerL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), lily.skinMat);
  lowerL.position.y = -0.1;
  armEL.add(lowerL);

  const handL = new THREE.Group();
  handL.position.y = -0.2;
  armEL.add(handL);
  lily.joints.handL = handL;

  // Legs
  const thighGeo = new THREE.BoxGeometry(0.12, 0.32, 0.12);
  const thighR = new THREE.Mesh(thighGeo, lily.clothMat);
  thighR.position.set(0.08, -0.16, 0.1);
  pelvis.add(thighR);

  const thighL = thighR.clone();
  thighL.position.x = -0.08;
  pelvis.add(thighL);

  // Props: Laptop (base + screen)
  lily.laptop = new THREE.Group();
  lily.laptop.position.set(0, -0.16, 0.26);
  pelvis.add(lily.laptop);
  lily.joints.laptop = lily.laptop;

  const lapBase = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.02, 0.26), makeMat('#2e2e38', 0.4, 0.3));
  lily.laptop.add(lapBase);

  lily.laptopScreen = new THREE.Group();
  lily.laptopScreen.position.set(0, 0.01, -0.13);
  lily.laptopScreen.rotation.x = d2r(100);
  lily.laptop.add(lily.laptopScreen);

  const screenLid = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.26, 0.015), makeMat('#2e2e38', 0.4, 0.3));
  screenLid.position.y = 0.13;
  lily.laptopScreen.add(screenLid);

  const displayGeo = new THREE.PlaneGeometry(0.36, 0.24);
  const displayMat = new THREE.MeshBasicMaterial({ color: 0x334466 });
  const display = new THREE.Mesh(displayGeo, displayMat);
  display.position.set(0, 0.13, 0.009);
  lily.laptopScreen.add(display);

  // Props: Pillow
  lily.pillow = new THREE.Group();
  lily.pillow.position.set(0.05, 0.4, -0.22);
  torso.add(lily.pillow);
  lily.joints.pillow = lily.pillow;

  const pillowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.24), makeMat('#ffe8ed', 0.95));
  pillowMesh.rotation.set(d2r(15), d2r(-10), d2r(5));
  lily.pillow.add(pillowMesh);

  // Tag parts for poke raycasting
  pelvis.userData = { part: 'pelvis' };
  torso.userData = { part: 'torso' };
  neck.userData = { part: 'head' };
  armUR.userData = { part: 'arm' };
  armUL.userData = { part: 'arm' };
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
