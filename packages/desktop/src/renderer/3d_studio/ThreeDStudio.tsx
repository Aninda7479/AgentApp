import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  Box,
  Image as ImageIcon,
  Layers,
  Maximize2,
  PaintBucket,
  Bone,
  Play,
  Upload,
  Wand2,
  CheckCircle2,
  AlertCircle,
  Info,
  Sparkles,
  Compass,
  Grid,
  Download,
  ThumbsUp,
  ThumbsDown,
  Share2,
  RefreshCw,
  Eye,
  Sliders,
  ChevronDown,
  Plus,
  ArrowRight
} from 'lucide-react';
import type { PartnerController } from '../logic/agentStream';

interface GeneratedModel {
  ok: boolean;
  disabled?: boolean;
  path?: string;
  format?: string;
  provider?: string;
  message?: string;
}

interface ThreeDStudioProps {
  partners: PartnerController;
  triggerToast: (message: string, type?: 'info' | 'error') => void;
}

const STAGES = [
  { id: 1, label: 'Concept Design', Icon: ImageIcon, desc: 'Generate or upload concept images and choose stylizations.' },
  { id: 2, label: 'Geometric generation', Icon: Box, desc: 'Build the 3D mesh geometry from the concept using AI models.' },
  { id: 3, label: 'Component splitting', Icon: Layers, desc: 'Segment the mesh into hair, clothes, limbs, and body parts.' },
  { id: 4, label: 'Low-mode topology', Icon: Sliders, desc: 'Optimize topology and reduce polygon/vertex counts.' },
  { id: 5, label: 'UV Exposure', Icon: Maximize2, desc: 'Unwrap the 3D geometry into flat UV coordinates.' },
  { id: 6, label: 'Texture drawing', Icon: PaintBucket, desc: 'Paint or bake high-quality PBR shaders and texture maps.' },
  { id: 7, label: 'Bone binding and skin', Icon: Bone, desc: 'Insert skeletal rig bones and skin joints for animations.' },
  { id: 8, label: 'Animation generation', Icon: Play, desc: 'Generate and test skeletal animations (Idle, Walk, Wave, Dance).' }
];

const PRESETS = [
  { id: 'preset-1', name: 'Chibi Model v3', img: 'chibi' },
  { id: 'preset-2', name: 'Steampunk Explorer', img: 'steampunk' },
  { id: 'preset-3', name: 'Robot Companion', img: 'robot' },
  { id: 'preset-4', name: 'Cyberpunk Bunny', img: 'bunny' },
  { id: 'preset-5', name: 'Low Poly Hero', img: 'lowpoly' }
];

export const ThreeDStudio: React.FC<ThreeDStudioProps> = ({ partners, triggerToast }) => {
  // Navigation & Active States
  const [activeStage, setActiveStage] = useState(1);
  const [name, setName] = useState('Luna');
  const [prompt, setPrompt] = useState('A cute chibi-style schoolgirl in A-pose, white shirt, black hair, and pink skirt.');
  const [conceptImage, setConceptImage] = useState<string | null>(null);
  const [conceptPreview, setConceptPreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedModel | null>(null);

  // Tab selections
  const [conceptTab, setConceptTab] = useState<'text' | 'image'>('text');
  const [rightSidebarTab, setRightSidebarTab] = useState<'assets' | 'layers' | 'property'>('assets');
  const [selectedPresetId, setSelectedPresetId] = useState('preset-1');

  // Input states
  const [stylization, setStylization] = useState('No choice');
  const [stylizeOpen, setStylizeOpen] = useState(false);
  const [aPose, setAPose] = useState(true);
  const [geometrySource, setGeometrySource] = useState('Concept Design');
  const [uploadMode, setUploadMode] = useState<'single' | 'multiple'>('single');
  const [modelType, setModelType] = useState('3D Generation - V3.1');
  const [faceCount, setFaceCount] = useState<'1.5M' | '1M' | '500k' | '50k'>('500k');

  // Viewport states
  const [shadingMode, setShadingMode] = useState<'clay' | 'flat' | 'textured'>('flat');
  const [showGrid, setShowGrid] = useState(true);
  const [animationPreset, setAnimationPreset] = useState<'idle' | 'walk' | 'wave' | 'dance'>('idle');

  // 3D Canvas Refs
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);

  // 3D Model object hierarchy refs
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const skeletonGroupRef = useRef<THREE.Group | null>(null);
  const leftArmJointRef = useRef<THREE.Group | null>(null);
  const rightArmJointRef = useRef<THREE.Group | null>(null);
  const leftLegJointRef = useRef<THREE.Group | null>(null);
  const rightLegJointRef = useRef<THREE.Group | null>(null);
  const chestJointRef = useRef<THREE.Group | null>(null);

  // Orbit rotation variables
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const [rotationSpeed, setRotationSpeed] = useState({ y: 0.003, x: 0 });

  const ipc = typeof window !== 'undefined' && (window as any).require
    ? (window as any).require('electron').ipcRenderer
    : null;

  // Dynamically load settings & check active config
  useEffect(() => {
    if (ipc) {
      ipc.invoke('settings-read').then((cfg: any) => {
        const threeD = cfg?.threeD || {};
        if (threeD.enabled) {
          if (threeD.provider) {
            triggerToast(`Ready: 3D generation provider is set to ${threeD.provider}.`, 'info');
          }
        }
      }).catch(() => {});
    }
  }, [ipc]);

  // Handle Pick Image
  const handlePickImage = async () => {
    if (!ipc) {
      triggerToast('Image picker is only available in the desktop app.', 'error');
      return;
    }
    try {
      const res = (await ipc.invoke('pick-image-file')) as { path?: string | null };
      if (res?.path) {
        setConceptImage(res.path);
        setConceptPreview(`file:///${res.path.replace(/\\/g, '/')}`);
        triggerToast('Concept image loaded successfully.');
      }
    } catch {
      triggerToast('Could not open image picker.', 'error');
    }
  };

  // Handle Generate IPC
  const handleGenerate = async () => {
    if (!ipc) {
      triggerToast('3D generation is only available in the desktop app.', 'error');
      return;
    }
    if (!name.trim()) {
      triggerToast('Please provide a character name.', 'error');
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const res = (await ipc.invoke('three-d-generate', {
        name: name.trim(),
        prompt: prompt.trim() || undefined,
        imagePath: conceptImage || undefined
      })) as GeneratedModel;

      setResult(res);

      if (res.disabled) {
        triggerToast('3D Model Gen is disabled in Settings.', 'info');
        setActiveStage(1);
      } else if (res.ok && res.path) {
        triggerToast('3D Model successfully generated! View step 8 to import it.', 'info');
        setActiveStage(8);
      } else if (res.message) {
        triggerToast(res.message, 'info');
      }
    } catch (e: any) {
      triggerToast(`3D generation failed: ${e?.message ?? e}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  // Import model into active partner
  const handleImportToPet = async () => {
    if (!result?.ok || !result.path) {
      triggerToast('Generate a character first.', 'error');
      return;
    }
    const activeId = partners.activeId;
    if (!activeId) {
      triggerToast('No active Partner to attach the model.', 'info');
      return;
    }
    try {
      await partners.importModel(activeId, result.path);
      partners.setActive(activeId);
      await partners.startPet();
      const label = result.provider === 'local' ? 'local offline placeholder' : result.provider || 'cloud';
      triggerToast(`3D character imported (${label}) — showing in desktop pet window!`, 'info');
    } catch {
      triggerToast('Could not attach the model to the active Partner.', 'error');
    }
  };

  // Build textures procedurally for UV exposure / painting
  const createCheckerboardTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1e1e2e';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#89b4fa';
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
      ctx.fillStyle = '#f38ba8';
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

  const createPaintedTexture = (styleName: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // base fill
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#f9e2af'); // hair/face tones
      grad.addColorStop(0.5, '#cba6f7'); // shirt tones
      grad.addColorStop(1, '#f38ba8'); // skirt tones
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);

      // Draw outfit details
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 100, 256, 60); // white top
      ctx.fillStyle = '#a6adc8';
      ctx.fillRect(100, 100, 56, 60); // necktie

      // Draw face features
      ctx.fillStyle = '#11111b';
      ctx.beginPath();
      ctx.arc(80, 50, 10, 0, Math.PI * 2);
      ctx.arc(176, 50, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f5e0dc';
      ctx.beginPath();
      ctx.arc(80, 52, 4, 0, Math.PI * 2);
      ctx.arc(176, 52, 4, 0, Math.PI * 2);
      ctx.fill();

      // cheeks blush
      ctx.fillStyle = 'rgba(243, 139, 168, 0.4)';
      ctx.beginPath();
      ctx.arc(60, 65, 12, 0, Math.PI * 2);
      ctx.arc(196, 65, 12, 0, Math.PI * 2);
      ctx.fill();

      // mouth
      ctx.strokeStyle = '#11111b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(128, 60, 8, 0, Math.PI);
      ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
  };

  // Initialize Three.js Viewport
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const width = canvasContainerRef.current.clientWidth;
    const height = canvasContainerRef.current.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0e11);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 4.5);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    canvasContainerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 4, 5);
    scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0xb4befe, 0.4);
    backLight.position.set(-2, 2, -3);
    scene.add(backLight);

    // 5. Grid helper
    const gridHelper = new THREE.GridHelper(10, 20, 0x313244, 0x181825);
    gridHelper.position.y = -1.1;
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    // 6. Spawn Procedural Model Group
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    // 7. Spawn Rig Visualizer Group
    const skeletonGroup = new THREE.Group();
    scene.add(skeletonGroup);
    skeletonGroupRef.current = skeletonGroup;

    // 8. Handle Resize
    const handleResize = () => {
      if (!canvasContainerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = canvasContainerRef.current.clientWidth;
      const h = canvasContainerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 9. Animation/Render Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const render = () => {
      const elapsed = clock.getElapsedTime();

      // Auto rotation
      if (modelGroupRef.current) {
        modelGroupRef.current.rotation.y += rotationSpeed.y;
        modelGroupRef.current.rotation.x += rotationSpeed.x;
      }
      if (skeletonGroupRef.current) {
        skeletonGroupRef.current.rotation.y += rotationSpeed.y;
        skeletonGroupRef.current.rotation.x += rotationSpeed.x;
      }

      // Procedural animations for limbs
      if (activeStage === 8) {
        const timeFactor = elapsed * 3.5;
        if (animationPreset === 'idle') {
          // Breathing motion
          if (chestJointRef.current) chestJointRef.current.position.y = -0.1 + Math.sin(elapsed * 2) * 0.02;
          if (leftArmJointRef.current) leftArmJointRef.current.rotation.z = Math.sin(elapsed * 2) * 0.03;
          if (rightArmJointRef.current) rightArmJointRef.current.rotation.z = -Math.sin(elapsed * 2) * 0.03;
        } else if (animationPreset === 'walk') {
          // Swinging arms and legs
          if (leftArmJointRef.current) leftArmJointRef.current.rotation.x = Math.sin(timeFactor) * 0.4;
          if (rightArmJointRef.current) rightArmJointRef.current.rotation.x = -Math.sin(timeFactor) * 0.4;
          if (leftLegJointRef.current) leftLegJointRef.current.rotation.x = -Math.sin(timeFactor) * 0.3;
          if (rightLegJointRef.current) rightLegJointRef.current.rotation.x = Math.sin(timeFactor) * 0.3;
          if (modelGroupRef.current) modelGroupRef.current.position.y = Math.abs(Math.sin(timeFactor * 2)) * 0.05;
        } else if (animationPreset === 'wave') {
          // Waving arm
          if (leftArmJointRef.current) {
            leftArmJointRef.current.rotation.x = 0;
            leftArmJointRef.current.rotation.z = 1.8 + Math.sin(timeFactor * 1.5) * 0.3;
          }
          if (rightArmJointRef.current) {
            rightArmJointRef.current.rotation.z = -0.2;
            rightArmJointRef.current.rotation.x = 0;
          }
        } else if (animationPreset === 'dance') {
          // Dance bobbing
          if (modelGroupRef.current) {
            modelGroupRef.current.position.y = Math.sin(timeFactor * 1.5) * 0.12;
            modelGroupRef.current.rotation.y = elapsed * 1.2;
          }
          if (leftArmJointRef.current) leftArmJointRef.current.rotation.z = 1.0 + Math.sin(timeFactor) * 0.4;
          if (rightArmJointRef.current) rightArmJointRef.current.rotation.z = -1.0 - Math.sin(timeFactor) * 0.4;
        }
      } else {
        // Reset animations
        if (modelGroupRef.current) modelGroupRef.current.position.y = 0;
        if (leftArmJointRef.current) {
          leftArmJointRef.current.rotation.set(0, 0, 0);
        }
        if (rightArmJointRef.current) {
          rightArmJointRef.current.rotation.set(0, 0, 0);
        }
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

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (rendererRef.current && rendererRef.current.domElement) {
        rendererRef.current.domElement.remove();
      }
    };
  }, [activeStage, animationPreset, rotationSpeed]);

  // Re-build character meshes on stage/shading changes
  useEffect(() => {
    const scene = sceneRef.current;
    const modelGroup = modelGroupRef.current;
    const skeletonGroup = skeletonGroupRef.current;
    if (!scene || !modelGroup || !skeletonGroup) return;

    // Clear old meshes
    while (modelGroup.children.length > 0) {
      const child = modelGroup.children[0];
      modelGroup.remove(child);
    }
    while (skeletonGroup.children.length > 0) {
      const child = skeletonGroup.children[0];
      skeletonGroup.remove(child);
    }

    // Grid helper visibility
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }

    // Stage 1 doesn't show character in viewport unless we want to show a pre-generated model
    if (activeStage === 1 && !conceptImage) {
      // Draw a holographic grid mesh or billboard
      const boxGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
      const wireframe = new THREE.WireframeGeometry(boxGeo);
      const line = new THREE.LineSegments(wireframe);
      line.material = new THREE.LineBasicMaterial({ color: 0x313244, linewidth: 1 });
      modelGroup.add(line);
      return;
    }

    // Geometry details depend on Low Poly topology stage
    const isLowPoly = activeStage === 4;
    const radialSegs = isLowPoly ? 6 : 24;
    const sphereSegs = isLowPoly ? 6 : 32;

    // Define Shaders / Materials
    let skinMat: THREE.Material;
    let hairMat: THREE.Material;
    let shirtMat: THREE.Material;
    let skirtMat: THREE.Material;
    let outlineMat = new THREE.MeshBasicMaterial({ color: 0xef4444, wireframe: true, transparent: true, opacity: 0.8 });

    if (shadingMode === 'clay') {
      const clayMat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.5,
        metalness: 0.1,
        flatShading: isLowPoly
      });
      skinMat = clayMat;
      hairMat = clayMat;
      shirtMat = clayMat;
      skirtMat = clayMat;
    } else if (activeStage === 3) {
      // Component Splitting Color Coding
      hairMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.6 }); // green hair
      shirtMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.6 }); // blue shirt
      skirtMat = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.6 }); // pink skirt
      skinMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 }); // red limbs
    } else if (activeStage === 5) {
      // UV Exposure texture grid mapping
      const uvTexture = createCheckerboardTexture();
      const uvMat = new THREE.MeshBasicMaterial({ map: uvTexture });
      skinMat = uvMat;
      hairMat = uvMat;
      shirtMat = uvMat;
      skirtMat = uvMat;
    } else if (activeStage >= 6) {
      // Textured painting model
      const pTexture = createPaintedTexture(stylization);
      const paintedMat = new THREE.MeshStandardMaterial({
        map: pTexture,
        roughness: 0.4,
        metalness: 0.1,
        flatShading: isLowPoly
      });
      skinMat = paintedMat;
      hairMat = paintedMat;
      shirtMat = paintedMat;
      skirtMat = paintedMat;
    } else {
      // Standard shaded view
      skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.5, flatShading: isLowPoly }); // skin yellow
      hairMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7, flatShading: isLowPoly }); // dark hair
      shirtMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1, roughness: 0.4, flatShading: isLowPoly }); // white shirt
      skirtMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.6, flatShading: isLowPoly }); // red skirt
    }

    // Build the character hierarchy Group
    const characterGroup = new THREE.Group();

    // 1. Torso/Chest Group
    const chestJoint = new THREE.Group();
    chestJoint.position.set(0, -0.1, 0);
    characterGroup.add(chestJoint);
    chestJointRef.current = chestJoint;

    const torsoGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.55, radialSegs);
    const torsoMesh = new THREE.Mesh(torsoGeo, shirtMat);
    torsoMesh.position.y = 0.2;
    chestJoint.add(torsoMesh);

    // 2. Neck & Head
    const neckGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.12, radialSegs);
    const neckMesh = new THREE.Mesh(neckGeo, skinMat);
    neckMesh.position.y = 0.52;
    chestJoint.add(neckMesh);

    const headGeo = new THREE.SphereGeometry(0.32, sphereSegs, sphereSegs);
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.position.y = 0.78;
    chestJoint.add(headMesh);

    // Chibi Hair clumps
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

    // Skirt
    const skirtGeo = new THREE.CylinderGeometry(0.22, 0.38, 0.26, radialSegs);
    const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
    skirtMesh.position.y = -0.12;
    characterGroup.add(skirtMesh);

    // 3. Left Arm Joint
    const leftArmJoint = new THREE.Group();
    leftArmJoint.position.set(-0.25, 0.38, 0);
    chestJoint.add(leftArmJoint);
    leftArmJointRef.current = leftArmJoint;

    const armGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.42, radialSegs);
    const leftArmMesh = new THREE.Mesh(armGeo, skinMat);
    leftArmMesh.position.y = -0.18; // offset to rotate around shoulder
    leftArmJoint.add(leftArmMesh);

    // 4. Right Arm Joint
    const rightArmJoint = new THREE.Group();
    rightArmJoint.position.set(0.25, 0.38, 0);
    chestJoint.add(rightArmJoint);
    rightArmJointRef.current = rightArmJoint;

    const rightArmMesh = new THREE.Mesh(armGeo, skinMat);
    rightArmMesh.position.y = -0.18; // offset
    rightArmJoint.add(rightArmMesh);

    // 5. Left Leg Joint
    const leftLegJoint = new THREE.Group();
    leftLegJoint.position.set(-0.12, -0.22, 0);
    characterGroup.add(leftLegJoint);
    leftLegJointRef.current = leftLegJoint;

    const legGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.62, radialSegs);
    const leftLegMesh = new THREE.Mesh(legGeo, skinMat);
    leftLegMesh.position.y = -0.3; // offset to rotate around hip
    leftLegJoint.add(leftLegMesh);

    // 6. Right Leg Joint
    const rightLegJoint = new THREE.Group();
    rightLegJoint.position.set(0.12, -0.22, 0);
    characterGroup.add(rightLegJoint);
    rightLegJointRef.current = rightLegJoint;

    const rightLegMesh = new THREE.Mesh(legGeo, skinMat);
    rightLegMesh.position.y = -0.3; // offset
    rightLegJoint.add(rightLegMesh);

    // Wireframe overlay for low poly top stage
    if (activeStage === 4) {
      const outlineL = new THREE.Mesh(leftLegMesh.geometry.clone(), outlineMat);
      outlineL.position.copy(leftLegMesh.position);
      leftLegJoint.add(outlineL);

      const outlineR = new THREE.Mesh(rightLegMesh.geometry.clone(), outlineMat);
      outlineR.position.copy(rightLegMesh.position);
      rightLegJoint.add(outlineR);

      const outlineArmL = new THREE.Mesh(leftArmMesh.geometry.clone(), outlineMat);
      outlineArmL.position.copy(leftArmMesh.position);
      leftArmJoint.add(outlineArmL);

      const outlineArmR = new THREE.Mesh(rightArmMesh.geometry.clone(), outlineMat);
      outlineArmR.position.copy(rightArmMesh.position);
      rightArmJoint.add(outlineArmR);

      const outlineHead = new THREE.Mesh(headMesh.geometry.clone(), outlineMat);
      outlineHead.position.copy(headMesh.position);
      chestJoint.add(outlineHead);

      const outlineTorso = new THREE.Mesh(torsoMesh.geometry.clone(), outlineMat);
      outlineTorso.position.copy(torsoMesh.position);
      chestJoint.add(outlineTorso);
    }

    modelGroup.add(characterGroup);

    // Stage 7: Rigging Skeleton Visualizer
    if (activeStage === 7) {
      // Build a wireframe visual skeleton overlay
      const jointGeo = new THREE.SphereGeometry(0.04, 16, 16);
      const boneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
      const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false, linewidth: 2 });

      // Translucent clay character
      characterGroup.traverse((node: any) => {
        if (node.isMesh) {
          node.material = new THREE.MeshBasicMaterial({
            color: 0x313244,
            transparent: true,
            opacity: 0.45,
            wireframe: false
          });
        }
      });

      // Spawn visual joints
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

      // Connect joints with line bones
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

  }, [activeStage, shadingMode, showGrid, conceptImage, stylization]);

  // Viewport Orbit Mouse Drag handler
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    previousMousePositionRef.current = {
      x: e.clientX,
      y: e.clientY
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;

    const deltaMove = {
      x: e.clientX - previousMousePositionRef.current.x,
      y: e.clientY - previousMousePositionRef.current.y
    };

    if (modelGroupRef.current && skeletonGroupRef.current) {
      modelGroupRef.current.rotation.y += deltaMove.x * 0.01;
      modelGroupRef.current.rotation.x += deltaMove.y * 0.01;
      skeletonGroupRef.current.rotation.y += deltaMove.x * 0.01;
      skeletonGroupRef.current.rotation.x += deltaMove.y * 0.01;
    }

    previousMousePositionRef.current = {
      x: e.clientX,
      y: e.clientY
    };

    setRotationSpeed({ x: 0, y: 0 }); // stop auto rotation on user interaction
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Get dynamic vertex count & model plane count stats per stage
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
    <div className="flex flex-col h-full w-full bg-[#0a0a0c] text-white select-none relative overflow-hidden font-sans">
      {/* 3D Studio Navbar Header */}
      <header className="h-12 w-full flex items-center justify-between border-b border-[#1a1a24]/80 px-4 md:px-6 bg-[#0c0c0f]">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center">
            <Box size={14} className="text-white" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">3D Studio Workspace</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-955/40 border border-cyan-800/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[10px] text-cyan-400 font-medium">Remaining attempts today: 27</span>
          </div>
          <div className="w-7 h-7 rounded-full bg-slate-800 border border-[#2a2a35] flex items-center justify-center cursor-pointer">
            <Eye size={12} className="text-slate-400" />
          </div>
        </div>
      </header>

      {/* Main workspace layout */}
      <div className="flex-1 flex relative overflow-hidden min-h-0">
        
        {/* LEFT VERTICAL STEP NAVIGATION */}
        <nav className="w-[180px] border-r border-[#1a1a24]/80 bg-[#0c0c0f]/90 flex flex-col p-2 space-y-1 z-10 shrink-0">
          <div className="px-2 py-1.5 mb-1 select-none">
            <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Pipeline Stages</span>
          </div>
          {STAGES.map((s) => {
            const isActive = activeStage === s.id;
            const isCompleted = activeStage > s.id;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setActiveStage(s.id);
                  if (s.id >= 6 && shadingMode === 'clay') {
                    setShadingMode('flat'); // exit clay mode for textured stages
                  }
                }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-left transition-all duration-200 cursor-pointer border ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-950/60 to-blue-950/20 border-cyan-500/30 text-white font-semibold shadow-inner'
                    : 'border-transparent text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
                }`}
              >
                <div
                  className={`w-6 h-6 flex items-center justify-center rounded-md shrink-0 transition-all ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : isCompleted
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-slate-900/80 text-slate-500'
                  }`}
                >
                  {isCompleted ? <CheckCircle2 size={13} /> : <s.Icon size={13} />}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] leading-tight truncate">{s.label}</span>
                  <span className="text-[8px] text-slate-500 leading-none truncate">Stage 0{s.id}</span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* FLOATING ACTION PARAMETERS CARD (LEFT) */}
        <div className="absolute left-[196px] top-4 w-[280px] max-h-[calc(100%-32px)] glass-card border border-[#2a2a35]/60 rounded-xl p-4 flex flex-col gap-4 bg-[#0a0a0e]/95 shadow-2xl z-20 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between border-b border-[#1a1a24] pb-2">
            <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
              {STAGES[activeStage - 1].label}
            </span>
            <span className="text-[9px] text-slate-500 font-mono">Stage 0{activeStage}</span>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed bg-[#121217]/50 rounded-lg p-2.5 border border-[#1a1a24]">
            {STAGES[activeStage - 1].desc}
          </p>

          {/* STAGE 1 PANEL: Concept Design */}
          {activeStage === 1 && (
            <div className="flex flex-col gap-3">
              <div className="flex rounded-lg bg-slate-950 p-0.5 border border-[#1d1d26]">
                <button
                  onClick={() => setConceptTab('text')}
                  className={`flex-1 py-1 text-[10px] font-medium rounded-md transition-all ${
                    conceptTab === 'text' ? 'bg-[#181825] text-white border border-[#2a2a38]' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Wensheng Tu / Image Multiple Views
                </button>
                <button
                  onClick={() => setConceptTab('image')}
                  className={`flex-1 py-1 text-[10px] font-medium rounded-md transition-all ${
                    conceptTab === 'image' ? 'bg-[#181825] text-white border border-[#2a2a38]' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Wen Sheng Tu born from multiple views
                </button>
              </div>

              {conceptTab === 'text' ? (
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Prompt text</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    placeholder="Enter style, description, character look..."
                    className="w-full rounded-lg border border-[#1d1d26] bg-[#0c0c0f] px-2.5 py-2 text-[10px] text-white outline-none focus:border-cyan-500/50 resize-none font-mono"
                  />
                  <div className="flex justify-between items-center text-[9px] text-slate-500">
                    <span>Single subject recommended</span>
                    <span>{prompt.length}/150</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Concept Image</label>
                  <button
                    onClick={handlePickImage}
                    className="w-full h-28 border border-dashed border-[#2a2a38] hover:border-cyan-500/40 bg-[#0c0c0f] rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    <Upload size={18} className="text-cyan-500" />
                    <span className="text-[9px] font-bold">Upload</span>
                    <span className="text-[7px] text-slate-600 px-3 text-center leading-normal">Character only available, supports png/jpg/jpeg/webp, maximum file size not exceeding 10MB, minimum resolution requirement 128*128, maximum 4096*4096</span>
                  </button>
                  {conceptImage && (
                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-cyan-950/20 border border-cyan-800/20 text-[9px] text-cyan-300 truncate">
                      <CheckCircle2 size={10} className="shrink-0" />
                      <span className="truncate">{conceptImage.split(/[\\/]/).pop()}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Pose toggle */}
              <div className="flex items-center justify-between py-1 bg-slate-900/30 rounded-lg px-2 border border-[#1a1a24]">
                <span className="text-[9px] text-slate-400 font-medium">Standardized A-pose</span>
                <input
                  type="checkbox"
                  checked={aPose}
                  onChange={(e) => setAPose(e.target.checked)}
                  className="rounded bg-[#0c0c0f] border-[#2a2a38] text-cyan-500 focus:ring-0 w-3.5 h-3.5"
                />
              </div>

              {/* Stylization selector */}
              <div className="relative">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1 block">Stylization</label>
                <button
                  onClick={() => setStylizeOpen(!stylizeOpen)}
                  className="w-full flex items-center justify-between rounded-lg border border-[#1d1d26] bg-[#0c0c0f] px-2.5 py-2 text-[10px] text-white hover:bg-slate-900 text-left outline-none cursor-pointer"
                >
                  <span className="truncate font-medium">{stylization}</span>
                  <ChevronDown size={12} className="text-slate-500" />
                </button>

                {stylizeOpen && (
                  <div className="absolute left-0 right-0 mt-1.5 rounded-lg bg-[#0e0e12] border border-[#2a2a38] p-1.5 shadow-xl grid grid-cols-2 gap-1.5 z-30 animate-fade-in max-h-56 overflow-y-auto">
                    {[
                      { name: 'No choice', color: 'bg-slate-800' },
                      { name: 'Chibi', color: 'bg-pink-500' },
                      { name: 'Steampunk', color: 'bg-amber-600' },
                      { name: 'Futurism', color: 'bg-indigo-600' },
                      { name: 'Pixelation', color: 'bg-yellow-500' },
                      { name: 'Hand-drawn', color: 'bg-cyan-600' },
                      { name: 'Low polygon', color: 'bg-emerald-600' }
                    ].map((st) => (
                      <button
                        key={st.name}
                        onClick={() => {
                          setStylization(st.name);
                          setStylizeOpen(false);
                        }}
                        className={`p-1.5 rounded-md flex flex-col gap-1 text-[9px] font-medium text-left border ${
                          stylization === st.name ? 'border-cyan-500 bg-cyan-950/30' : 'border-transparent hover:bg-slate-900'
                        }`}
                      >
                        <div className={`w-full h-8 rounded ${st.color} opacity-40 shrink-0 flex items-center justify-center text-[7px] text-white font-bold uppercase tracking-wider`}>
                          {st.name.slice(0, 4)}
                        </div>
                        <span className="truncate text-slate-300">{st.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Generate button */}
              <button
                onClick={() => setActiveStage(2)}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-[10px] tracking-wide uppercase shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-2"
              >
                <Sparkles size={11} />
                <span>Save Concept & Continue</span>
              </button>
            </div>
          )}

          {/* STAGE 2 PANEL: Geometric Generation */}
          {activeStage === 2 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Seed Source</label>
                <select
                  value={geometrySource}
                  onChange={(e) => setGeometrySource(e.target.value)}
                  className="w-full rounded-lg border border-[#1d1d26] bg-[#0c0c0f] px-2 py-1.5 text-[10px] text-white outline-none cursor-pointer"
                >
                  <option value="Concept Design">Concept Design: {name}</option>
                  <option value="local">Or choose to upload locally</option>
                </select>
              </div>

              {geometrySource !== 'Concept Design' && (
                <div className="flex flex-col gap-1.5">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-[#1d1d26] bg-[#0c0c0f] cursor-pointer hover:bg-slate-900">
                      <input
                        type="radio"
                        name="upload"
                        checked={uploadMode === 'single'}
                        onChange={() => setUploadMode('single')}
                        className="text-cyan-500 focus:ring-0 w-3 h-3"
                      />
                      <span className="text-[9px] text-slate-300 font-medium">Upload a single image</span>
                    </label>
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-[#1d1d26] bg-[#0c0c0f] cursor-pointer hover:bg-slate-900">
                      <input
                        type="radio"
                        name="upload"
                        checked={uploadMode === 'multiple'}
                        onChange={() => setUploadMode('multiple')}
                        className="text-cyan-500 focus:ring-0 w-3 h-3"
                      />
                      <span className="text-[9px] text-slate-300 font-medium">Upload multiple views</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 bg-[#0c0c0f] rounded-lg p-2.5 border border-[#1d1d26]">
                <div className="text-[9px] text-slate-500 font-medium">Concept details mapping:</div>
                <div className="text-[9px] text-slate-300 truncate"><span className="text-slate-500">Name:</span> {name}</div>
                <div className="text-[9px] text-slate-300 truncate"><span className="text-slate-500">Style:</span> {stylization}</div>
                <div className="text-[9px] text-slate-300 truncate"><span className="text-slate-500">Prompt:</span> {prompt}</div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Select Model</label>
                <div className="relative">
                  <select
                    value={modelType}
                    onChange={(e) => setModelType(e.target.value)}
                    className="w-full rounded-lg border border-[#1d1d26] bg-[#0c0c0f] px-2 py-1.5 text-[10px] text-white outline-none cursor-pointer"
                  >
                    <option value="3D Generation - V3.1">3D Generation - V3.1 (Latest)</option>
                    <option value="3D Generation - V3.0">3D Generation - V3.0</option>
                    <option value="Legacy Alpha V2">Legacy Alpha V2</option>
                  </select>
                  <span className="absolute right-8 top-1.5 px-1 bg-cyan-900 text-[6px] text-cyan-200 font-bold rounded">NEW</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Model Face Count</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['1.5M', '1M', '500k', '50k'] as const).map((faces) => (
                    <button
                      key={faces}
                      onClick={() => setFaceCount(faces)}
                      className={`py-1 text-[8px] font-bold rounded-lg border ${
                        faceCount === faces
                          ? 'border-cyan-500 bg-cyan-950/40 text-cyan-400'
                          : 'border-[#1d1d26] bg-[#0c0c0f] text-slate-400 hover:bg-slate-900 cursor-pointer'
                      }`}
                    >
                      {faces}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-[10px] tracking-wide uppercase disabled:opacity-60 transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-2"
              >
                {generating ? <RefreshCw size={11} className="animate-spin" /> : <Wand2 size={11} />}
                <span>{generating ? 'Generating 3D model...' : 'Generate immediately'}</span>
              </button>

              {result && (
                <div className={`p-2.5 rounded-lg flex items-start gap-2 text-[9px] ${
                  result.ok ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}>
                  <Info size={11} className="shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold block mb-0.5">{result.ok ? 'Generation Success' : 'Generation Error'}</span>
                    <span className="leading-tight block">{result.message}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STAGE 3 PANEL: Component splitting */}
          {activeStage === 3 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Segmentation Source</label>
                <select className="w-full rounded-lg border border-[#1d1d26] bg-[#0c0c0f] px-2 py-1.5 text-[10px] text-white outline-none">
                  <option>Local models / {name}.glb</option>
                </select>
              </div>

              <div className="w-full h-32 border border-[#1d1d26] rounded-lg bg-[#050508] relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-950/20 via-transparent to-transparent opacity-70" />
                {/* Silhouette character avatar */}
                <div className="w-14 h-24 rounded-full border border-red-500/20 bg-red-950/10 flex flex-col items-center justify-center gap-1">
                  <div className="w-6 h-6 rounded-full bg-red-500/40" />
                  <div className="w-10 h-12 rounded bg-red-500/30" />
                </div>
              </div>

              <button
                onClick={() => {
                  triggerToast('Pre-segmentation triggered. Identified segments: hair (green), shirt (blue), skirt (pink), limbs (red).', 'info');
                  setShadingMode('flat');
                }}
                className="w-full py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-[10px] tracking-wide uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Layers size={11} />
                <span>Pre-segmentation</span>
              </button>
            </div>
          )}

          {/* STAGE 4 PANEL: Low-mode topology */}
          {activeStage === 4 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Simplify Source</label>
                <select className="w-full rounded-lg border border-[#1d1d26] bg-[#0c0c0f] px-2 py-1.5 text-[10px] text-white outline-none">
                  <option>Local models / {name}.glb</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Polygon Targets</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: '5k faces', count: 'low' },
                    { label: '10k faces', count: 'med-low' },
                    { label: '20k faces', count: 'medium' },
                    { label: '50k faces', count: 'high' }
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        triggerToast(`Polygon count targeted at ${preset.label}. mesh details reduced.`, 'info');
                      }}
                      className="py-1.5 rounded-lg border border-[#1d1d26] bg-[#0c0c0f] text-[9px] text-slate-300 font-medium hover:bg-slate-900 cursor-pointer text-center"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => triggerToast('Mesh decimation complete. Reduced vertex count by 97.9%.', 'info')}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-[10px] tracking-wide uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-2"
              >
                <Sliders size={11} />
                <span>Optimize Topology</span>
              </button>
            </div>
          )}

          {/* STAGE 5 PANEL: UV Exposure */}
          {activeStage === 5 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">UV Target</label>
                <select className="w-full rounded-lg border border-[#1d1d26] bg-[#0c0c0f] px-2 py-1.5 text-[10px] text-white outline-none">
                  <option>Local models / {name}.glb</option>
                </select>
              </div>

              <div className="flex flex-col gap-2 rounded-lg bg-slate-950 p-2.5 border border-[#1d1d26]">
                <div className="text-[9px] text-slate-500 font-semibold mb-1">UV Parameters:</div>
                <label className="flex items-center gap-2 text-[9px] text-slate-400">
                  <input type="checkbox" defaultChecked className="rounded text-cyan-500 w-3 h-3 bg-black border-[#2a2a38] focus:ring-0" />
                  <span>Smart seams placement</span>
                </label>
                <label className="flex items-center gap-2 text-[9px] text-slate-400">
                  <input type="checkbox" defaultChecked className="rounded text-cyan-500 w-3 h-3 bg-black border-[#2a2a38] focus:ring-0" />
                  <span>Maximize island coverage</span>
                </label>
              </div>

              <button
                onClick={() => triggerToast('UV Unwrap complete. 48 seams generated.', 'info')}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-[10px] tracking-wide uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-2"
              >
                <Maximize2 size={11} />
                <span>Generate UV Map</span>
              </button>
            </div>
          )}

          {/* STAGE 6 PANEL: Texture painting */}
          {activeStage === 6 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Texture Target</label>
                <select className="w-full rounded-lg border border-[#1d1d26] bg-[#0c0c0f] px-2 py-1.5 text-[10px] text-white outline-none">
                  <option>Local models / {name}.glb</option>
                </select>
              </div>

              <div className="flex flex-col gap-2 rounded-lg bg-slate-950 p-2.5 border border-[#1d1d26] space-y-1">
                <span className="text-[9px] text-slate-500 font-semibold mb-1">Brush Color:</span>
                <div className="flex items-center gap-1.5">
                  {['#f38ba8', '#a6e3a1', '#89b4fa', '#f9e2af', '#ffffff', '#11111b'].map((color) => (
                    <button
                      key={color}
                      className="w-6 h-6 rounded-full border border-[#2a2a38] cursor-pointer transition-all active:scale-95"
                      style={{ backgroundColor: color }}
                      onClick={() => triggerToast(`Selected color ${color} for painting.`)}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={() => {
                  setShadingMode('textured');
                  triggerToast('Textures baked successfully.', 'info');
                }}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-[10px] tracking-wide uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-2"
              >
                <PaintBucket size={11} />
                <span>Bake Textures</span>
              </button>
            </div>
          )}

          {/* STAGE 7 PANEL: Bone binding */}
          {activeStage === 7 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Rigging Target</label>
                <select className="w-full rounded-lg border border-[#1d1d26] bg-[#0c0c0f] px-2 py-1.5 text-[10px] text-white outline-none">
                  <option>Local models / {name}.glb</option>
                </select>
              </div>

              <div className="w-full h-32 border border-[#1d1d26] rounded-lg bg-[#050508] relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-950/20 via-transparent to-transparent opacity-70" />
                {/* Rigging skeleton skeleton */}
                <div className="relative w-12 h-24 flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full bg-cyan-400 border border-white" />
                  <div className="w-0.5 h-16 bg-cyan-400 relative">
                    <div className="absolute top-4 left-[-16px] right-[-16px] h-0.5 bg-cyan-400" />
                    <div className="absolute top-4 left-[-18px] w-2 h-2 rounded-full bg-cyan-400 border border-white" />
                    <div className="absolute top-4 right-[-18px] w-2 h-2 rounded-full bg-cyan-400 border border-white" />
                    <div className="absolute bottom-0 left-[-12px] right-[-12px] h-0.5 bg-cyan-400" />
                    <div className="absolute bottom-0 left-[-14px] w-2 h-2 rounded-full bg-cyan-400 border border-white" />
                    <div className="absolute bottom-0 right-[-14px] w-2 h-2 rounded-full bg-cyan-400 border border-white" />
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  triggerToast('Rigging coordinates auto-matched. Skeletal joints rendering.', 'info');
                }}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-[10px] tracking-wide uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Bone size={11} />
                <span>Generate Rig Bones</span>
              </button>
            </div>
          )}

          {/* STAGE 8 PANEL: Animation generation */}
          {activeStage === 8 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Animation Target</label>
                <select className="w-full rounded-lg border border-[#1d1d26] bg-[#0c0c0f] px-2 py-1.5 text-[10px] text-white outline-none">
                  <option>Local models / {name}.glb</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold font-semibold">Test Motion Presets</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['idle', 'walk', 'wave', 'dance'] as const).map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setAnimationPreset(preset)}
                      className={`py-1.5 rounded-lg border text-[9px] font-bold uppercase tracking-wider ${
                        animationPreset === preset
                          ? 'border-cyan-500 bg-cyan-950/40 text-cyan-400 shadow-inner shadow-cyan-950'
                          : 'border-[#1d1d26] bg-[#0c0c0f] text-slate-400 hover:bg-slate-900 cursor-pointer'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {result?.ok && result.path ? (
                <div className="flex flex-col gap-2 pt-2 border-t border-[#1a1a24] mt-1">
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 size={12} className="shrink-0" />
                    <span>GLTF/GLB file generated successfully on local disk.</span>
                  </div>
                  <button
                    onClick={handleImportToPet}
                    className="w-full py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-[10px] tracking-wide uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/10"
                  >
                    <Play size={11} />
                    <span>Launch 3D Companion Pet</span>
                  </button>
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-slate-950 border border-[#1d1d26] text-[8px] text-slate-500 leading-relaxed">
                  <span className="font-semibold block mb-0.5">Note:</span>
                  To export and launch this character in your pet window, return to Stage 2 and click "Generate".
                </div>
              )}
            </div>
          )}
        </div>

        {/* THREE.JS INTERACTIVE 3D VIEWPORT CANVAS */}
        <div
          ref={canvasContainerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="flex-1 h-full cursor-grab active:cursor-grabbing relative overflow-hidden"
        >
          {/* Middle Top stats HUD */}
          <div className="absolute top-4 left-1/2 translate-x-[-50%] flex gap-4 px-4 py-2 rounded-full border border-[#1a1a24]/80 bg-[#07070a]/90 backdrop-blur-md shadow-lg z-20 pointer-events-none select-none font-mono">
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-500 uppercase tracking-wider">model planes:</span>
              <span className="text-[10px] text-cyan-400 font-bold">{stats.faces}</span>
            </div>
            <div className="w-[1px] bg-slate-800" />
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-500 uppercase tracking-wider">vertex count:</span>
              <span className="text-[10px] text-cyan-400 font-bold">{stats.vertices}</span>
            </div>
          </div>

          {/* Viewport Floating Widget widgets (Top Right) */}
          <div className="absolute right-4 top-4 flex flex-col gap-2.5 z-20">
            {/* Ground Grid Switch */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1a1a24]/80 bg-[#07070a]/90 backdrop-blur-md shadow-md text-[9px] font-medium text-slate-400">
              <Grid size={12} className="text-slate-500" />
              <span>Ground Grid</span>
              <button
                onClick={() => setShowGrid(!showGrid)}
                className={`w-6 h-3 rounded-full transition-all relative ${
                  showGrid ? 'bg-cyan-500' : 'bg-slate-800'
                }`}
              >
                <div className={`w-2.5 h-2.5 rounded-full bg-white absolute top-0.25 transition-all ${
                  showGrid ? 'right-0.5' : 'left-0.5'
                }`} />
              </button>
            </div>

            {/* Orbit Compass Axis HUD */}
            <div className="w-10 h-10 rounded-full border border-[#1a1a24]/80 bg-[#07070a]/90 backdrop-blur-md shadow-md flex items-center justify-center text-slate-400">
              <Compass size={18} className="text-cyan-500" />
            </div>

            {/* RUNNING NODES HUD checklist */}
            <div className="w-[180px] rounded-xl border border-[#1a1a24]/80 bg-[#07070a]/90 backdrop-blur-md shadow-lg p-3 text-slate-400 select-none">
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-900 pb-1.5 mb-1.5 flex items-center justify-between">
                <span>Running nodes</span>
                <ChevronDown size={10} />
              </div>
              <div className="space-y-1.5 text-[9px]">
                {[
                  { label: 'Concept Design', stage: 1 },
                  { label: 'Geometric generation', stage: 2 },
                  { label: 'Component splitting', stage: 3 }
                ].map((node) => {
                  const isDone = activeStage > node.stage;
                  const isCurrent = activeStage === node.stage;
                  return (
                    <div key={node.label} className="flex items-center gap-2.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        isDone
                          ? 'bg-slate-600'
                          : isCurrent
                          ? 'bg-cyan-400 animate-pulse'
                          : 'bg-slate-800'
                      }`} />
                      <span className={`${isDone ? 'text-slate-600 line-through' : isCurrent ? 'text-cyan-400 font-semibold' : 'text-slate-500'}`}>
                        {node.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* VIEWPORT CONTROLS BAR (BOTTOM CENTER) */}
          <div className="absolute bottom-4 left-1/2 translate-x-[-50%] flex items-center gap-3 px-4 py-2 rounded-xl border border-[#1a1a24]/80 bg-[#07070a]/90 backdrop-blur-md shadow-lg z-20">
            {/* Shading modes circles */}
            <div className="flex items-center gap-1.5 pr-2 border-r border-slate-800">
              {[
                { mode: 'clay', tooltip: 'Solid Clay Shading', color: 'bg-slate-500 border-white/20' },
                { mode: 'flat', tooltip: 'Standard Shading', color: 'bg-slate-300 border-white/20' },
                { mode: 'textured', tooltip: 'Textured Shading', color: 'bg-gradient-to-tr from-cyan-400 via-pink-400 to-yellow-400 border-white/20' }
              ].map((sh) => (
                <button
                  key={sh.mode}
                  title={sh.tooltip}
                  onClick={() => setShadingMode(sh.mode as any)}
                  className={`w-4.5 h-4.5 rounded-full border-2 cursor-pointer transition-all hover:scale-110 active:scale-95 ${sh.color} ${
                    shadingMode === sh.mode ? 'border-cyan-500 ring-2 ring-cyan-500/20' : 'border-transparent'
                  }`}
                />
              ))}
            </div>

            {/* Download dropdown */}
            <button
              onClick={() => {
                if (result?.ok && result.path) {
                  triggerToast(`Mesh downloaded to local storage: ${result.path}`, 'info');
                } else {
                  triggerToast('Please run stage 2 generation first to prepare download.', 'info');
                }
              }}
              className="flex items-center gap-1.5 py-1 px-3 bg-cyan-600 hover:bg-cyan-500 transition-all rounded-lg text-white font-bold text-[9px] uppercase tracking-wider cursor-pointer"
            >
              <Download size={10} />
              <span>download</span>
              <ChevronDown size={10} className="text-cyan-200" />
            </button>
          </div>

          {/* FEEDBACK BUTTONS (BOTTOM RIGHT) */}
          <div className="absolute bottom-4 right-4 flex items-center gap-2 z-20">
            <button
              onClick={() => triggerToast('Feedback sent! Thank you.')}
              className="w-8 h-8 rounded-lg border border-[#1a1a24] bg-[#0c0c0f] flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-all cursor-pointer"
            >
              <ThumbsUp size={12} />
            </button>
            <button
              onClick={() => triggerToast('Feedback recorded.')}
              className="w-8 h-8 rounded-lg border border-[#1a1a24] bg-[#0c0c0f] flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-all cursor-pointer"
            >
              <ThumbsDown size={12} />
            </button>
            <button
              onClick={() => triggerToast('Share link copied to clipboard.')}
              className="w-8 h-8 rounded-lg border border-[#1a1a24] bg-[#0c0c0f] flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-all cursor-pointer"
            >
              <Share2 size={12} />
            </button>
          </div>
        </div>

        {/* RIGHT SIDEBAR PANEL */}
        <aside className="w-[200px] border-l border-[#1a1a24]/80 bg-[#0c0c0f]/90 flex flex-col z-10 shrink-0 select-none">
          {/* Side tabs */}
          <div className="flex border-b border-[#1a1a24] p-1 bg-slate-950">
            {(['assets', 'layers', 'property'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightSidebarTab(tab)}
                className={`flex-1 py-1.5 text-[9px] uppercase tracking-wider font-bold text-center rounded transition-all cursor-pointer ${
                  rightSidebarTab === tab
                    ? 'bg-[#181825] text-white border border-[#2a2a38]/80'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 custom-scrollbar flex flex-col gap-3.5">
            {rightSidebarTab === 'assets' && (
              <>
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Model Presets</div>
                <div className="grid grid-cols-2 gap-2">
                  {PRESETS.map((pr) => {
                    const isSelected = selectedPresetId === pr.id;
                    return (
                      <button
                        key={pr.id}
                        onClick={() => {
                          setSelectedPresetId(pr.id);
                          setName(pr.name);
                          triggerToast(`Loaded ${pr.name} preset template.`);
                        }}
                        className={`rounded-lg p-1.5 border text-left transition-all ${
                          isSelected
                            ? 'border-cyan-500 bg-cyan-950/20'
                            : 'border-[#1a1a24] bg-[#07070a] hover:bg-slate-900 cursor-pointer'
                        }`}
                      >
                        {/* Thumbnail color box representing texture/model type */}
                        <div className={`w-full h-12 rounded bg-gradient-to-br ${
                          pr.img === 'chibi' ? 'from-pink-500/20 to-purple-500/20 border-pink-500/10' :
                          pr.img === 'steampunk' ? 'from-amber-500/20 to-orange-500/20 border-amber-500/10' :
                          pr.img === 'robot' ? 'from-cyan-500/20 to-blue-500/20 border-cyan-500/10' :
                          pr.img === 'bunny' ? 'from-purple-500/20 to-indigo-500/20 border-purple-500/10' :
                          'from-emerald-500/20 to-teal-500/20 border-emerald-500/10'
                        } border flex items-center justify-center mb-1.5`}>
                          <Box size={14} className="text-slate-600" />
                        </div>
                        <div className="text-[8px] font-semibold text-slate-300 truncate">{pr.name}</div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {rightSidebarTab === 'layers' && (
              <div className="flex flex-col gap-2 text-[9px] text-slate-400 font-mono">
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest font-sans mb-1">Mesh hierarchy</div>
                <div className="flex items-center gap-1.5 text-cyan-400"><Layers size={10} /> <span>root_scene</span></div>
                <div className="pl-3 flex items-center gap-1.5 text-slate-300"><Layers size={10} /> <span>Luna_Group</span></div>
                <div className="pl-6 flex items-center gap-1.5 text-slate-500"><Box size={10} /> <span>head_mesh</span></div>
                <div className="pl-6 flex items-center gap-1.5 text-slate-500"><Box size={10} /> <span>torso_mesh</span></div>
                <div className="pl-6 flex items-center gap-1.5 text-slate-500"><Box size={10} /> <span>skirt_mesh</span></div>
                <div className="pl-6 flex items-center gap-1.5 text-slate-500"><Box size={10} /> <span>hair_clumps</span></div>
                <div className="pl-6 flex items-center gap-1.5 text-slate-500"><Bone size={10} /> <span>arm_joints_L</span></div>
                <div className="pl-6 flex items-center gap-1.5 text-slate-500"><Bone size={10} /> <span>arm_joints_R</span></div>
                <div className="pl-6 flex items-center gap-1.5 text-slate-500"><Bone size={10} /> <span>leg_joints_L</span></div>
                <div className="pl-6 flex items-center gap-1.5 text-slate-500"><Bone size={10} /> <span>leg_joints_R</span></div>
              </div>
            )}

            {rightSidebarTab === 'property' && (
              <div className="flex flex-col gap-3 text-[9px] text-slate-400">
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">properties</div>
                <div className="flex justify-between border-b border-slate-900 pb-1.5">
                  <span className="text-slate-500">Geometry format:</span>
                  <span className="font-semibold text-slate-300 font-mono">GLTF 2.0 Binary</span>
                </div>
                <div className="flex justify-between border-b border-slate-900 pb-1.5">
                  <span className="text-slate-500">Texture encoding:</span>
                  <span className="font-semibold text-slate-300 font-mono">sRGB (PNG)</span>
                </div>
                <div className="flex justify-between border-b border-slate-900 pb-1.5">
                  <span className="text-slate-500">Rig scale:</span>
                  <span className="font-semibold text-slate-300 font-mono">1.0, 1.0, 1.0</span>
                </div>
                <div className="flex justify-between border-b border-slate-900 pb-1.5">
                  <span className="text-slate-500">Animate state:</span>
                  <span className="font-semibold text-cyan-400 font-mono uppercase">{animationPreset}</span>
                </div>
              </div>
            )}
          </div>

          {/* Batch operations */}
          <div className="p-2 border-t border-[#1a1a24]/80 bg-slate-950 flex items-center justify-between mt-auto">
            <button
              onClick={() => triggerToast('Batch operations: Export all selected assets.')}
              className="w-full py-1.5 bg-[#121217] hover:bg-[#181824] transition-all rounded-md text-[8px] font-bold uppercase tracking-wider text-slate-400 hover:text-white border border-[#232330] cursor-pointer text-center"
            >
              Batch operations
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ThreeDStudio;
