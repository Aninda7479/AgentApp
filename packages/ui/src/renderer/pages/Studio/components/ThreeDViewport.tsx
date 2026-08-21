import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Grid,
  Compass,
  ChevronDown,
  Download,
  ThumbsUp,
  ThumbsDown,
  Share2,
  Layers,
  Box,
  Bone
} from 'lucide-react';
import { TransformState, GeneratedModel } from './types';

interface ThreeDViewportProps {
  activeStage: number;
  showGrid: boolean;
  onShowGridChange: (val: boolean) => void;
  autoRotate: boolean;
  onAutoRotateChange: (val: boolean) => void;
  shadingMode: 'clay' | 'flat' | 'textured';
  onShadingModeChange: (mode: 'clay' | 'flat' | 'textured') => void;
  conceptImage: string | null;
  stylization: string;
  result: GeneratedModel | null;
  visibleNodes: Record<string, boolean>;
  modelPosition: TransformState;
  modelRotation: TransformState;
  modelScale: TransformState;
  materialColor: string;
  materialRoughness: number;
  materialMetalness: number;
  animationPreset: 'idle' | 'walk' | 'wave' | 'dance';
  animationSpeed: number;
  isAnimating: boolean;
  triggerToast: (msg: string, type?: 'info' | 'error') => void;
}

export const ThreeDViewport: React.FC<ThreeDViewportProps> = ({
  activeStage,
  showGrid,
  onShowGridChange,
  autoRotate,
  onAutoRotateChange,
  shadingMode,
  onShadingModeChange,
  conceptImage,
  stylization,
  result,
  visibleNodes,
  modelPosition,
  modelRotation,
  modelScale,
  materialColor,
  materialRoughness,
  materialMetalness,
  animationPreset,
  animationSpeed,
  isAnimating,
  triggerToast
}) => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const controlsInteractingRef = useRef<boolean>(false);

  // Model references for animation
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const skeletonGroupRef = useRef<THREE.Group | null>(null);
  const leftArmJointRef = useRef<THREE.Group | null>(null);
  const rightArmJointRef = useRef<THREE.Group | null>(null);
  const leftLegJointRef = useRef<THREE.Group | null>(null);
  const rightLegJointRef = useRef<THREE.Group | null>(null);
  const chestJointRef = useRef<THREE.Group | null>(null);

  // View snapping coordinates
  const snapToView = (direction: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'reset') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const distance = 4.5;
    controlsRef.current.target.set(0, 0, 0);

    switch (direction) {
      case 'front':
        cameraRef.current.position.set(0, 0, distance);
        break;
      case 'back':
        cameraRef.current.position.set(0, 0, -distance);
        break;
      case 'left':
        cameraRef.current.position.set(-distance, 0, 0);
        break;
      case 'right':
        cameraRef.current.position.set(distance, 0, 0);
        break;
      case 'top':
        cameraRef.current.position.set(0, distance, 0.001);
        break;
      case 'bottom':
        cameraRef.current.position.set(0, -distance, 0.001);
        break;
      case 'reset':
      default:
        cameraRef.current.position.set(0, 0.5, distance);
        controlsRef.current.target.set(0, 0.2, 0);
        break;
    }
    controlsRef.current.update();
    triggerToast(`View aligned to ${direction}.`);
  };

  // Keyboard snapping listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }
      
      switch (e.key) {
        case '1':
          snapToView('front');
          break;
        case '3':
          snapToView('right');
          break;
        case '7':
          snapToView('top');
          break;
        case '0':
          snapToView('reset');
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Initialize Three.js Viewport
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const width = canvasContainerRef.current.clientWidth;
    const height = canvasContainerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2c2d28);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.5, 4.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    canvasContainerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.5;
    controls.maxDistance = 15;
    controls.target.set(0, 0.2, 0);
    controls.addEventListener('start', () => {
      controlsInteractingRef.current = true;
    });
    controls.addEventListener('end', () => {
      controlsInteractingRef.current = false;
    });
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 4, 5);
    scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0x89b4fa, 0.4);
    backLight.position.set(-2, 2, -3);
    scene.add(backLight);

    const gridHelper = new THREE.GridHelper(10, 20, 0x1f1f2e, 0x11111b);
    gridHelper.position.y = -1.1;
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    const skeletonGroup = new THREE.Group();
    scene.add(skeletonGroup);
    skeletonGroupRef.current = skeletonGroup;

    const handleResize = () => {
      if (!canvasContainerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = canvasContainerRef.current.clientWidth;
      const h = canvasContainerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    let animationFrameId: number;
    let clock = new THREE.Clock();

    const render = () => {
      const elapsed = clock.getElapsedTime();

      if (autoRotate && !controlsInteractingRef.current) {
        if (modelGroupRef.current) modelGroupRef.current.rotation.y += 0.005;
        if (skeletonGroupRef.current) skeletonGroupRef.current.rotation.y += 0.005;
      }

      controls.update();

      if (activeStage === 8 && isAnimating) {
        const timeFactor = elapsed * 3.5 * animationSpeed;
        if (animationPreset === 'idle') {
          if (chestJointRef.current) chestJointRef.current.position.y = -0.1 + Math.sin(elapsed * 2) * 0.02;
          if (leftArmJointRef.current) leftArmJointRef.current.rotation.z = Math.sin(elapsed * 2) * 0.03;
          if (rightArmJointRef.current) rightArmJointRef.current.rotation.z = -Math.sin(elapsed * 2) * 0.03;
        } else if (animationPreset === 'walk') {
          if (leftArmJointRef.current) leftArmJointRef.current.rotation.x = Math.sin(timeFactor) * 0.4;
          if (rightArmJointRef.current) rightArmJointRef.current.rotation.x = -Math.sin(timeFactor) * 0.4;
          if (leftLegJointRef.current) leftLegJointRef.current.rotation.x = -Math.sin(timeFactor) * 0.3;
          if (rightLegJointRef.current) rightLegJointRef.current.rotation.x = Math.sin(timeFactor) * 0.3;
          if (modelGroupRef.current) modelGroupRef.current.position.y = Math.abs(Math.sin(timeFactor * 2)) * 0.05;
        } else if (animationPreset === 'wave') {
          if (leftArmJointRef.current) {
            leftArmJointRef.current.rotation.x = 0;
            leftArmJointRef.current.rotation.z = 1.8 + Math.sin(timeFactor * 1.5) * 0.3;
          }
          if (rightArmJointRef.current) {
            rightArmJointRef.current.rotation.z = -0.2;
            rightArmJointRef.current.rotation.x = 0;
          }
        } else if (animationPreset === 'dance') {
          if (modelGroupRef.current) {
            modelGroupRef.current.position.y = Math.sin(timeFactor * 1.5) * 0.12;
            modelGroupRef.current.rotation.y = elapsed * 1.2;
          }
          if (leftArmJointRef.current) leftArmJointRef.current.rotation.z = 1.0 + Math.sin(timeFactor) * 0.4;
          if (rightArmJointRef.current) rightArmJointRef.current.rotation.z = -1.0 - Math.sin(timeFactor) * 0.4;
        }
      } else {
        if (modelGroupRef.current) modelGroupRef.current.position.y = 0;
        if (leftArmJointRef.current) leftArmJointRef.current.rotation.set(0, 0, 0);
        if (rightArmJointRef.current) rightArmJointRef.current.rotation.set(0, 0, 0);
        if (leftLegJointRef.current) leftLegJointRef.current.rotation.set(0, 0, 0);
        if (rightLegJointRef.current) rightLegJointRef.current.rotation.set(0, 0, 0);
        if (chestJointRef.current) chestJointRef.current.position.set(0, -0.1, 0);
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (rendererRef.current && rendererRef.current.domElement) {
        rendererRef.current.domElement.remove();
      }
    };
  }, [activeStage, animationPreset, animationSpeed, isAnimating, autoRotate]);

  // Procedural checkers textures
  const createCheckerboardTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1e1e2e';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 256; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 256);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(256, i);
        ctx.stroke();
      }
      ctx.fillStyle = '#f43f5e';
      ctx.font = '10px monospace';
      for (let x = 0; x < 256; x += 64) {
        for (let y = 0; y < 256; y += 64) {
          ctx.fillText(`U:${x/64} V:${y/64}`, x + 5, y + 15);
        }
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    return texture;
  };

  const createPaintedTexture = (styleName: string, baseColorHex: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#fde047');
      grad.addColorStop(0.5, '#3b82f6');
      grad.addColorStop(1, baseColorHex);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 100, 256, 60);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(100, 100, 56, 60);

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(80, 50, 10, 0, Math.PI * 2);
      ctx.arc(176, 50, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(80, 52, 4, 0, Math.PI * 2);
      ctx.arc(176, 52, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(244, 63, 94, 0.4)';
      ctx.beginPath();
      ctx.arc(60, 65, 12, 0, Math.PI * 2);
      ctx.arc(196, 65, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(128, 60, 8, 0, Math.PI);
      ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
  };

  // Re-build character meshes on stage/shading/material changes
  useEffect(() => {
    const scene = sceneRef.current;
    const modelGroup = modelGroupRef.current;
    const skeletonGroup = skeletonGroupRef.current;
    if (!scene || !modelGroup || !skeletonGroup) return;

    while (modelGroup.children.length > 0) {
      const child = modelGroup.children[0];
      modelGroup.remove(child);
    }
    while (skeletonGroup.children.length > 0) {
      const child = skeletonGroup.children[0];
      skeletonGroup.remove(child);
    }

    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }

    if (activeStage === 1 && !conceptImage) {
      const boxGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
      const wireframe = new THREE.WireframeGeometry(boxGeo);
      const line = new THREE.LineSegments(wireframe);
      line.material = new THREE.LineBasicMaterial({ color: 0x334155, linewidth: 1 });
      modelGroup.add(line);
      return;
    }

    const isLowPoly = activeStage === 4;
    const radialSegs = isLowPoly ? 6 : 24;
    const sphereSegs = isLowPoly ? 6 : 32;

    let skinMat: THREE.Material;
    let hairMat: THREE.Material;
    let shirtMat: THREE.Material;
    let skirtMat: THREE.Material;
    let outlineMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, wireframe: true, transparent: true, opacity: 0.8 });

    if (shadingMode === 'clay') {
      const clayMat = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.6,
        metalness: 0.05,
        flatShading: isLowPoly
      });
      skinMat = clayMat;
      hairMat = clayMat;
      shirtMat = clayMat;
      skirtMat = clayMat;
    } else if (activeStage === 3) {
      hairMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.6 });
      shirtMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.6 });
      skirtMat = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.6 });
      skinMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 });
    } else if (activeStage === 5) {
      const uvTexture = createCheckerboardTexture();
      const uvMat = new THREE.MeshBasicMaterial({ map: uvTexture });
      skinMat = uvMat;
      hairMat = uvMat;
      shirtMat = uvMat;
      skirtMat = uvMat;
    } else if (activeStage >= 6) {
      const pTexture = createPaintedTexture(stylization, materialColor);
      const paintedMat = new THREE.MeshStandardMaterial({
        map: pTexture,
        roughness: materialRoughness,
        metalness: materialMetalness,
        flatShading: isLowPoly
      });
      skinMat = paintedMat;
      hairMat = paintedMat;
      shirtMat = paintedMat;
      skirtMat = paintedMat;
    } else {
      skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: materialRoughness, metalness: materialMetalness, flatShading: isLowPoly });
      hairMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: materialRoughness, metalness: materialMetalness, flatShading: isLowPoly });
      shirtMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: materialRoughness, metalness: materialMetalness, flatShading: isLowPoly });
      skirtMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: materialRoughness, metalness: materialMetalness, flatShading: isLowPoly });
    }

    const characterGroup = new THREE.Group();

    characterGroup.position.set(modelPosition.x, modelPosition.y, modelPosition.z);
    characterGroup.rotation.set(
      THREE.MathUtils.degToRad(modelRotation.x),
      THREE.MathUtils.degToRad(modelRotation.y),
      THREE.MathUtils.degToRad(modelRotation.z)
    );
    characterGroup.scale.set(modelScale.x, modelScale.y, modelScale.z);

    const chestJoint = new THREE.Group();
    chestJoint.position.set(0, -0.1, 0);
    if (visibleNodes.torso_mesh) {
      const torsoGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.55, radialSegs);
      const torsoMesh = new THREE.Mesh(torsoGeo, shirtMat);
      torsoMesh.position.y = 0.2;
      chestJoint.add(torsoMesh);
    }
    characterGroup.add(chestJoint);
    chestJointRef.current = chestJoint;

    if (visibleNodes.head_mesh) {
      const neckGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.12, radialSegs);
      const neckMesh = new THREE.Mesh(neckGeo, skinMat);
      neckMesh.position.y = 0.52;
      chestJoint.add(neckMesh);

      const headGeo = new THREE.SphereGeometry(0.32, sphereSegs, sphereSegs);
      const headMesh = new THREE.Mesh(headGeo, skinMat);
      headMesh.position.y = 0.78;
      chestJoint.add(headMesh);
    }

    if (visibleNodes.hair_clumps) {
      const hairGeo = new THREE.SphereGeometry(0.2, sphereSegs, sphereSegs);
      const hairL = new THREE.Mesh(hairGeo, hairMat);
      hairL.position.set(-0.2, 0.86, 0.1);
      hairL.scale.set(1, 1.1, 1);
      chestJoint.add(hairL);

      const hairR = new THREE.Mesh(hairGeo, hairMat);
      hairR.position.set(0.2, 0.86, 0.1);
      hairR.scale.set(1, 1.1, 1);
      chestJoint.add(hairR);

      const hairBackGeo = new THREE.SphereGeometry(0.28, sphereSegs, sphereSegs);
      const hairBack = new THREE.Mesh(hairBackGeo, hairMat);
      hairBack.position.set(0, 0.74, -0.15);
      chestJoint.add(hairBack);
    }

    if (visibleNodes.skirt_mesh) {
      const skirtGeo = new THREE.CylinderGeometry(0.22, 0.38, 0.26, radialSegs);
      const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
      skirtMesh.position.y = -0.12;
      characterGroup.add(skirtMesh);
    }

    const leftArmJoint = new THREE.Group();
    leftArmJoint.position.set(-0.25, 0.38, 0);
    if (visibleNodes.arm_joints_L) {
      const armGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.42, radialSegs);
      const leftArmMesh = new THREE.Mesh(armGeo, skinMat);
      leftArmMesh.position.y = -0.18;
      leftArmJoint.add(leftArmMesh);
    }
    chestJoint.add(leftArmJoint);
    leftArmJointRef.current = leftArmJoint;

    const rightArmJoint = new THREE.Group();
    rightArmJoint.position.set(0.25, 0.38, 0);
    if (visibleNodes.arm_joints_R) {
      const armGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.42, radialSegs);
      const rightArmMesh = new THREE.Mesh(armGeo, skinMat);
      rightArmMesh.position.y = -0.18;
      rightArmJoint.add(rightArmMesh);
    }
    chestJoint.add(rightArmJoint);
    rightArmJointRef.current = rightArmJoint;

    const leftLegJoint = new THREE.Group();
    leftLegJoint.position.set(-0.12, -0.22, 0);
    if (visibleNodes.leg_joints_L) {
      const legGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.62, radialSegs);
      const leftLegMesh = new THREE.Mesh(legGeo, skinMat);
      leftLegMesh.position.y = -0.3;
      leftLegJoint.add(leftLegMesh);
    }
    characterGroup.add(leftLegJoint);
    leftLegJointRef.current = leftLegJoint;

    const rightLegJoint = new THREE.Group();
    rightLegJoint.position.set(0.12, -0.22, 0);
    if (visibleNodes.leg_joints_R) {
      const legGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.62, radialSegs);
      const rightLegMesh = new THREE.Mesh(legGeo, skinMat);
      rightLegMesh.position.y = -0.3;
      rightLegJoint.add(rightLegMesh);
    }
    characterGroup.add(rightLegJoint);
    rightLegJointRef.current = rightLegJoint;

    if (activeStage === 4) {
      const outlineGeo = (mesh: THREE.Mesh) => new THREE.Mesh(mesh.geometry.clone(), outlineMat);
      
      leftArmJoint.children.forEach(c => {
        if (c instanceof THREE.Mesh) {
          const outline = outlineGeo(c);
          outline.position.copy(c.position);
          leftArmJoint.add(outline);
        }
      });
      rightArmJoint.children.forEach(c => {
        if (c instanceof THREE.Mesh) {
          const outline = outlineGeo(c);
          outline.position.copy(c.position);
          rightArmJoint.add(outline);
        }
      });
      leftLegJoint.children.forEach(c => {
        if (c instanceof THREE.Mesh) {
          const outline = outlineGeo(c);
          outline.position.copy(c.position);
          leftLegJoint.add(outline);
        }
      });
      rightLegJoint.children.forEach(c => {
        if (c instanceof THREE.Mesh) {
          const outline = outlineGeo(c);
          outline.position.copy(c.position);
          rightLegJoint.add(outline);
        }
      });
    }

    modelGroup.add(characterGroup);

    if (activeStage === 7) {
      const jointGeo = new THREE.SphereGeometry(0.04, 16, 16);
      const boneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
      const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false, linewidth: 2 });

      characterGroup.traverse((node: any) => {
        if (node.isMesh) {
          node.material = new THREE.MeshBasicMaterial({
            color: 0x334155,
            transparent: true,
            opacity: 0.35,
            wireframe: false
          });
        }
      });

      const joints = [
        { name: 'root', pos: [0, -0.22, 0] },
        { name: 'pelvis', pos: [0, -0.1, 0] },
        { name: 'chest', pos: [0, 0.28, 0] },
        { name: 'neck', pos: [0, 0.42, 0] },
        { name: 'head', pos: [0, 0.68, 0] },
        { name: 'shoulder_L', pos: [-0.25, 0.28, 0] },
        { name: 'elbow_L', pos: [-0.25, 0.1, 0] },
        { name: 'wrist_L', pos: [-0.25, -0.1, 0] },
        { name: 'shoulder_R', pos: [0.25, 0.28, 0] },
        { name: 'elbow_R', pos: [0.25, 0.1, 0] },
        { name: 'wrist_R', pos: [0.25, -0.1, 0] },
        { name: 'hip_L', pos: [-0.12, -0.22, 0] },
        { name: 'knee_L', pos: [-0.12, -0.5, 0] },
        { name: 'ankle_L', pos: [-0.12, -0.8, 0] },
        { name: 'hip_R', pos: [0.12, -0.22, 0] },
        { name: 'knee_R', pos: [0.12, -0.5, 0] },
        { name: 'ankle_R', pos: [0.12, -0.8, 0] }
      ];

      const jointMeshes: Record<string, THREE.Mesh> = {};
      joints.forEach((j) => {
        const mesh = new THREE.Mesh(jointGeo, boneMat);
        mesh.position.set(j.pos[0], j.pos[1], j.pos[2]);
        skeletonGroup.add(mesh);
        jointMeshes[j.name] = mesh;
      });

      const connections = [
        ['root', 'pelvis'],
        ['pelvis', 'chest'],
        ['chest', 'neck'],
        ['neck', 'head'],
        ['chest', 'shoulder_L'],
        ['shoulder_L', 'elbow_L'],
        ['elbow_L', 'wrist_L'],
        ['chest', 'shoulder_R'],
        ['shoulder_R', 'elbow_R'],
        ['elbow_R', 'wrist_R'],
        ['pelvis', 'hip_L'],
        ['hip_L', 'knee_L'],
        ['knee_L', 'ankle_L'],
        ['pelvis', 'hip_R'],
        ['hip_R', 'knee_R'],
        ['knee_R', 'ankle_R']
      ];

      connections.forEach(([fromName, toName]) => {
        const fromMesh = jointMeshes[fromName];
        const toMesh = jointMeshes[toName];
        if (fromMesh && toMesh) {
          const points = [fromMesh.position, toMesh.position];
          const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(lineGeo, lineMat);
          skeletonGroup.add(line);
        }
      });
    }

  }, [activeStage, shadingMode, showGrid, conceptImage, stylization, visibleNodes, modelPosition, modelRotation, modelScale, materialColor, materialRoughness, materialMetalness]);

  const getViewportStats = () => {
    switch (activeStage) {
      case 1:
        return { faces: '—', vertices: '—' };
      case 2:
        return { faces: '2,342,002', vertices: '1,170,969' };
      case 3:
        return { faces: '1,499,850', vertices: '740,897' };
      case 4:
        return { faces: '23,955', vertices: '12,613' };
      case 5:
        return { faces: '23,955', vertices: '12,613' };
      case 6:
        return { faces: '23,955', vertices: '12,613' };
      case 7:
        return { faces: '23,955', vertices: '12,613' };
      case 8:
        return {
          faces: result?.provider === 'local' ? '12 (procedural cube)' : '23,955',
          vertices: result?.provider === 'local' ? '8' : '12,613'
        };
      default:
        return { faces: '—', vertices: '—' };
    }
  };

  const stats = getViewportStats();

  return (
    <div
      ref={canvasContainerRef}
      className="flex-1 h-full cursor-grab active:cursor-grabbing relative overflow-hidden"
    >
      {/* Middle Top stats HUD */}
      <div className="absolute top-4 left-1/2 translate-x-[-50%] flex gap-4 px-4 py-2 rounded-full border border-slate-800/80 bg-slate-950/90 backdrop-blur-md shadow-lg z-20 pointer-events-none select-none font-mono">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">Faces:</span>
          <span className="text-[10px] text-sky-400 font-bold">{stats.faces}</span>
        </div>
        <div className="w-[1px] bg-slate-800" />
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">Vertices:</span>
          <span className="text-[10px] text-sky-400 font-bold">{stats.vertices}</span>
        </div>
      </div>

      {/* Viewport Floating Widgets (Top Right) */}
      <div className="absolute right-4 top-4 flex flex-col gap-2.5 z-20">
        {/* Ground Grid Switch */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-855 bg-slate-950/90 backdrop-blur-md shadow-md text-[9px] font-medium text-slate-400">
          <Grid size={12} className="text-slate-500" />
          <span>Ground Grid</span>
          <button
            onClick={() => onShowGridChange(!showGrid)}
            className={`w-6 h-3 rounded-full transition-all relative ${
              showGrid ? 'bg-sky-500' : 'bg-slate-800'
            }`}
          >
            <div className={`w-2 h-2 rounded-full bg-white absolute top-0.5 transition-all ${
              showGrid ? 'right-0.5' : 'left-0.5'
            }`} />
          </button>
        </div>

        {/* Auto rotate Switch */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-855 bg-slate-950/90 backdrop-blur-md shadow-md text-[9px] font-medium text-slate-400">
          <Compass size={12} className="text-slate-500" />
          <span>Auto Rotate</span>
          <button
            onClick={() => onAutoRotateChange(!autoRotate)}
            className={`w-6 h-3 rounded-full transition-all relative ${
              autoRotate ? 'bg-sky-500' : 'bg-slate-800'
            }`}
          >
            <div className={`w-2 h-2 rounded-full bg-white absolute top-0.5 transition-all ${
              autoRotate ? 'right-0.5' : 'left-0.5'
            }`} />
          </button>
        </div>

        {/* Navigation Snap axes HUD */}
        <div className="rounded-xl border border-slate-855 bg-slate-950/90 backdrop-blur-md shadow-lg p-2.5 text-slate-400 flex flex-col gap-1.5">
          <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1 text-center">Axis Snaps</div>
          <div className="grid grid-cols-3 gap-1">
            {(['front', 'back', 'left', 'right', 'top', 'bottom'] as const).map(dir => (
              <button
                key={dir}
                onClick={() => snapToView(dir)}
                className="px-1.5 py-1 bg-slate-900 border border-slate-800 rounded hover:bg-slate-800 text-[8px] uppercase tracking-wider font-mono text-slate-300 font-semibold cursor-pointer"
              >
                {dir.slice(0, 3)}
              </button>
            ))}
          </div>
          <button
            onClick={() => snapToView('reset')}
            className="w-full py-1 bg-slate-800 hover:bg-slate-700 text-[8px] uppercase tracking-wider font-semibold rounded mt-1 cursor-pointer text-center text-slate-300"
          >
            Center Cam
          </button>
        </div>

        {/* Running Pipeline Status */}
        <div className="w-[180px] rounded-xl border border-slate-855 bg-slate-950/90 backdrop-blur-md shadow-lg p-3 text-slate-400 select-none">
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-900 pb-1.5 mb-1.5 flex items-center justify-between">
            <span>Pipeline Progress</span>
            <ChevronDown size={10} />
          </div>
          <div className="space-y-1.5 text-[9px]">
            {[
              { label: 'Concept Design', stage: 1 },
              { label: 'Mesh Generation', stage: 2 },
              { label: 'Segmentation', stage: 3 }
            ].map((node) => {
              const isDone = activeStage > node.stage;
              const isCurrent = activeStage === node.stage;
              return (
                <div key={node.label} className="flex items-center gap-2.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    isDone
                      ? 'bg-slate-600'
                      : isCurrent
                      ? 'bg-sky-400 animate-pulse'
                      : 'bg-slate-800'
                  }`} />
                  <span className={`${isDone ? 'text-slate-600 line-through' : isCurrent ? 'text-sky-400 font-semibold' : 'text-slate-500'}`}>
                    {node.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* VIEWPORT CONTROLS BAR (BOTTOM CENTER) */}
      <div className="absolute bottom-4 left-1/2 translate-x-[-50%] flex items-center gap-3 px-4 py-2 rounded-xl border border-slate-800/80 bg-slate-950/95 backdrop-blur-md shadow-lg z-20">
        {/* Shading modes circles */}
        <div className="flex items-center gap-2 pr-3 border-r border-slate-800">
          {[
            { mode: 'clay', tooltip: 'Solid Clay Shading', color: 'bg-slate-500 border-white/20' },
            { mode: 'flat', tooltip: 'Standard Shading', color: 'bg-slate-300 border-white/20' },
            { mode: 'textured', tooltip: 'Textured Painting Shading', color: 'bg-gradient-to-tr from-sky-400 via-pink-400 to-yellow-400 border-white/20' }
          ].map((sh) => (
            <button
              key={sh.mode}
              title={sh.tooltip}
              onClick={() => onShadingModeChange(sh.mode as any)}
              className={`w-5 h-5 rounded-full border-2 cursor-pointer transition-all hover:scale-110 active:scale-95 ${sh.color} ${
                shadingMode === sh.mode ? 'border-sky-500 ring-2 ring-sky-500/20 shadow-lg' : 'border-transparent'
              }`}
            />
          ))}
        </div>

        {/* Download dropdown */}
        <button
          onClick={() => {
            if (result?.ok && result.path) {
              triggerToast(`Mesh downloaded to local path: ${result.path}`, 'info');
            } else {
              triggerToast('Run stage 2 generation first to compile download artifacts.', 'info');
            }
          }}
          className="flex items-center gap-1.5 py-1 px-3 bg-sky-500 hover:bg-sky-400 transition-all rounded-lg text-white font-bold text-[9px] uppercase tracking-wider cursor-pointer"
        >
          <Download size={10} />
          <span>Export</span>
        </button>
      </div>

      {/* FEEDBACK BUTTONS (BOTTOM RIGHT) */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 z-20">
        <button
          onClick={() => triggerToast('Feedback sent! Thank you.')}
          className="w-8 h-8 rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-all cursor-pointer"
        >
          <ThumbsUp size={12} />
        </button>
        <button
          onClick={() => triggerToast('Feedback recorded.')}
          className="w-8 h-8 rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-all cursor-pointer"
        >
          <ThumbsDown size={12} />
        </button>
        <button
          onClick={() => triggerToast('Share link copied to clipboard.')}
          className="w-8 h-8 rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-all cursor-pointer"
        >
          <Share2 size={12} />
        </button>
      </div>
    </div>
  );
};
export default ThreeDViewport;
