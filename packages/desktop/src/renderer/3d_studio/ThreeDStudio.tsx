import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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
  EyeOff,
  Sliders,
  ChevronDown,
  Plus,
  ArrowRight,
  Trash2,
  FolderOpen,
  Move,
  Palette
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

interface SavedModel {
  name: string;
  path: string;
  format: string;
  size: number;
  modified: number;
}

interface ThreeDStudioProps {
  partners: PartnerController;
  triggerToast: (message: string, type?: 'info' | 'error') => void;
}

const STAGES = [
  { id: 1, label: 'Concept Design', Icon: ImageIcon, desc: 'Define your character using descriptive text prompts or upload a reference style/concept image.' },
  { id: 2, label: 'Mesh Generation', Icon: Box, desc: 'Generate high-fidelity 3D mesh geometry from the design concepts using advanced AI models.' },
  { id: 3, label: 'Segmentation', Icon: Layers, desc: 'Split the model mesh automatically into functional sub-components (hair, clothes, body limbs).' },
  { id: 4, label: 'Retopology', Icon: Sliders, desc: 'Optimize the geometric structure to low-poly layout for efficient real-time rendering and storage.' },
  { id: 5, label: 'UV Unwrapping', Icon: Maximize2, desc: 'Flatten the 3D model geometry coordinates into a 2D map texture projection coordinate layout.' },
  { id: 6, label: 'Texture Painting', Icon: PaintBucket, desc: 'Bake textures and paint color profiles, roughness, metalness, and normal maps onto the model.' },
  { id: 7, label: 'Rigging & Skinning', Icon: Bone, desc: 'Generate skeletal rig joints and skin weight distributions for character motion.' },
  { id: 8, label: 'Animation Playback', Icon: Play, desc: 'Apply skeletal animations (Idle, Walk, Wave, Dance) and export to your companion desktop pet.' }
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
  const [rightSidebarTab, setRightSidebarTab] = useState<'library' | 'scene' | 'transform' | 'material'>('library');
  const [selectedPresetId, setSelectedPresetId] = useState('preset-1');

  // Input states
  const [stylization, setStylization] = useState('Chibi');
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
  const [animationSpeed, setAnimationSpeed] = useState(1.0);
  const [isAnimating, setIsAnimating] = useState(true);

  // Model management list
  const [savedModels, setSavedModels] = useState<SavedModel[]>([]);

  // Scene Hierarchy visible items
  const [visibleNodes, setVisibleNodes] = useState<Record<string, boolean>>({
    head_mesh: true,
    torso_mesh: true,
    skirt_mesh: true,
    hair_clumps: true,
    arm_joints_L: true,
    arm_joints_R: true,
    leg_joints_L: true,
    leg_joints_R: true
  });

  // Transform states
  const [modelPosition, setModelPosition] = useState({ x: 0, y: 0, z: 0 });
  const [modelRotation, setModelRotation] = useState({ x: 0, y: 0, z: 0 });
  const [modelScale, setModelScale] = useState({ x: 1, y: 1, z: 1 });

  // Material Editor states
  const [materialColor, setMaterialColor] = useState('#f1c40f');
  const [materialRoughness, setMaterialRoughness] = useState(0.5);
  const [materialMetalness, setMaterialMetalness] = useState(0.1);

  // 3D Canvas Refs
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const controlsInteractingRef = useRef<boolean>(false);

  // 3D Model object hierarchy refs
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const skeletonGroupRef = useRef<THREE.Group | null>(null);
  const leftArmJointRef = useRef<THREE.Group | null>(null);
  const rightArmJointRef = useRef<THREE.Group | null>(null);
  const leftLegJointRef = useRef<THREE.Group | null>(null);
  const rightLegJointRef = useRef<THREE.Group | null>(null);
  const chestJointRef = useRef<THREE.Group | null>(null);

  const [autoRotate, setAutoRotate] = useState(true);

  const ipc = typeof window !== 'undefined' && (window as any).require
    ? (window as any).require('electron').ipcRenderer
    : null;

  // Load settings & check active config & list models
  useEffect(() => {
    loadSavedModels();

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

  const loadSavedModels = async () => {
    if (ipc) {
      try {
        const list = await ipc.invoke('three-d-list-models');
        setSavedModels(list || []);
      } catch (err) {
        console.error('Failed to load saved models', err);
      }
    } else {
      // Mock data in browser
      setSavedModels([
        { name: 'mock-chibi-princess', path: 'mock/path/princess.glb', format: 'glb', size: 1048576, modified: Date.now() - 3600000 },
        { name: 'mock-cyberpunk-runner', path: 'mock/path/runner.glb', format: 'glb', size: 2048576, modified: Date.now() - 86400000 }
      ]);
    }
  };

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
      // Offline fallback demonstration
      setGenerating(true);
      setTimeout(() => {
        setGenerating(false);
        const demoResult = {
          ok: true,
          path: 'offline_mock_gltf.gltf',
          format: 'gltf',
          provider: 'local',
          message: 'Local mock character generated in web mode successfully!'
        };
        setResult(demoResult);
        triggerToast('Local mock model successfully generated (web mode)!', 'info');
        setActiveStage(8);
        loadSavedModels();
      }, 2000);
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
        loadSavedModels();
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
  const handleImportToPet = async (modelPath?: string) => {
    const importPath = modelPath || result?.path;
    if (!importPath) {
      triggerToast('Select or generate a character first.', 'error');
      return;
    }
    const activeId = partners.activeId;
    if (!activeId) {
      triggerToast('No active Partner to attach the model.', 'info');
      return;
    }
    try {
      await partners.importModel(activeId, importPath);
      partners.setActive(activeId);
      await partners.startPet();
      const label = modelPath ? 'model database' : (result?.provider === 'local' ? 'local offline placeholder' : result?.provider || 'cloud');
      triggerToast(`3D character imported (${label}) — showing in desktop pet window!`, 'info');
    } catch {
      triggerToast('Could not attach the model to the active Partner.', 'error');
    }
  };

  // Delete model
  const handleDeleteModel = async (modelPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this model?')) return;
    if (ipc) {
      try {
        const res = await ipc.invoke('three-d-delete-model', { filePath: modelPath });
        if (res.ok) {
          triggerToast('Model deleted successfully.');
          loadSavedModels();
          if (result?.path === modelPath) {
            setResult(null);
          }
        } else {
          triggerToast(res.message || 'Failed to delete model.', 'error');
        }
      } catch (err: any) {
        triggerToast(err.message || 'Error occurred during deletion.', 'error');
      }
    } else {
      setSavedModels(savedModels.filter(m => m.path !== modelPath));
      triggerToast('Mock model deleted (web mode).');
    }
  };

  // Import external model file
  const handleImportExternalModel = async () => {
    if (ipc) {
      try {
        const res = await ipc.invoke('three-d-import-external-model');
        if (res.ok) {
          triggerToast(`Successfully imported: ${res.name}`);
          loadSavedModels();
        } else if (res.path !== null) {
          triggerToast(res.message || 'Failed to import model.', 'error');
        }
      } catch (err: any) {
        triggerToast(err.message || 'Error importing file.', 'error');
      }
    } else {
      triggerToast('Import file is only supported in desktop mode.', 'info');
    }
  };

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

  // View snapping coordinates
  const snapToView = (direction: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'reset') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const distance = 4.5;
    
    // Set controls target to origin
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
        cameraRef.current.position.set(0, distance, 0.001); // offset slightly to prevent gimbal lock
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
      // Check if we are inside input elements
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

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0c);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.5, 4.5);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    canvasContainerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls
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

    // 5. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 4, 5);
    scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0x89b4fa, 0.4);
    backLight.position.set(-2, 2, -3);
    scene.add(backLight);

    // 6. Grid helper
    const gridHelper = new THREE.GridHelper(10, 20, 0x1f1f2e, 0x11111b);
    gridHelper.position.y = -1.1;
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    // 7. Spawn Procedural Model Group
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    // 8. Spawn Rig Visualizer Group
    const skeletonGroup = new THREE.Group();
    scene.add(skeletonGroup);
    skeletonGroupRef.current = skeletonGroup;

    // 9. Handle Resize
    const handleResize = () => {
      if (!canvasContainerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = canvasContainerRef.current.clientWidth;
      const h = canvasContainerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 10. Animation/Render Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const render = () => {
      const elapsed = clock.getElapsedTime();

      // Auto rotation logic (gradual rotation when no user dragging controls)
      if (autoRotate && !controlsInteractingRef.current) {
        if (modelGroupRef.current) {
          modelGroupRef.current.rotation.y += 0.005;
        }
        if (skeletonGroupRef.current) {
          skeletonGroupRef.current.rotation.y += 0.005;
        }
      }

      // Update Controls
      controls.update();

      // Procedural animations for limbs
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
        // Reset animations
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

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (rendererRef.current && rendererRef.current.domElement) {
        rendererRef.current.domElement.remove();
      }
    };
  }, [activeStage, animationPreset, animationSpeed, isAnimating, autoRotate]);

  // Re-build character meshes on stage/shading/material changes
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
      const boxGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
      const wireframe = new THREE.WireframeGeometry(boxGeo);
      const line = new THREE.LineSegments(wireframe);
      line.material = new THREE.LineBasicMaterial({ color: 0x334155, linewidth: 1 });
      modelGroup.add(line);
      return;
    }

    // Geometry details depend on low poly stage
    const isLowPoly = activeStage === 4;
    const radialSegs = isLowPoly ? 6 : 24;
    const sphereSegs = isLowPoly ? 6 : 32;

    // Define Shaders / Materials
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
      // Component Splitting Color Coding
      hairMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.6 }); // green hair
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
      // Textured painting model / custom material adjustments
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
      // Standard shaded view using active properties
      skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: materialRoughness, metalness: materialMetalness, flatShading: isLowPoly });
      hairMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: materialRoughness, metalness: materialMetalness, flatShading: isLowPoly });
      shirtMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: materialRoughness, metalness: materialMetalness, flatShading: isLowPoly });
      skirtMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: materialRoughness, metalness: materialMetalness, flatShading: isLowPoly });
    }

    // Build the character hierarchy Group
    const characterGroup = new THREE.Group();

    // Apply Real-time transforms to the model group
    characterGroup.position.set(modelPosition.x, modelPosition.y, modelPosition.z);
    characterGroup.rotation.set(
      THREE.MathUtils.degToRad(modelRotation.x),
      THREE.MathUtils.degToRad(modelRotation.y),
      THREE.MathUtils.degToRad(modelRotation.z)
    );
    characterGroup.scale.set(modelScale.x, modelScale.y, modelScale.z);

    // 1. Torso/Chest Group
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

    // 2. Head & Neck
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

    // Hair clumps
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

    // Skirt
    if (visibleNodes.skirt_mesh) {
      const skirtGeo = new THREE.CylinderGeometry(0.22, 0.38, 0.26, radialSegs);
      const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
      skirtMesh.position.y = -0.12;
      characterGroup.add(skirtMesh);
    }

    // 3. Left Arm Joint
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

    // 4. Right Arm Joint
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

    // 5. Left Leg Joint
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

    // 6. Right Leg Joint
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

    // Wireframe overlay for low poly top stage
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

    // Stage 7: Rigging Skeleton Visualizer
    if (activeStage === 7) {
      const jointGeo = new THREE.SphereGeometry(0.04, 16, 16);
      const boneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
      const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false, linewidth: 2 });

      // Make character translucent
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

  }, [activeStage, shadingMode, showGrid, conceptImage, stylization, visibleNodes, modelPosition, modelRotation, modelScale, materialColor, materialRoughness, materialMetalness]);

  // Load preset settings on select
  const handlePresetSelect = (presetId: string, name: string) => {
    setSelectedPresetId(presetId);
    setName(name);
    if (presetId === 'preset-1') {
      setStylization('Chibi');
      setMaterialColor('#ec4899');
    } else if (presetId === 'preset-2') {
      setStylization('Steampunk');
      setMaterialColor('#b45309');
    } else if (presetId === 'preset-3') {
      setStylization('Futurism');
      setMaterialColor('#38bdf8');
    } else if (presetId === 'preset-4') {
      setStylization('Pixelation');
      setMaterialColor('#8b5cf6');
    } else {
      setStylization('Low polygon');
      setMaterialColor('#10b981');
    }
    triggerToast(`Loaded ${name} preset template.`);
  };

  // Preset material configurations
  const applyMaterialPreset = (preset: 'clay' | 'chrome' | 'gold' | 'hologram' | 'plastic') => {
    switch (preset) {
      case 'clay':
        setMaterialColor('#94a3b8');
        setMaterialRoughness(0.9);
        setMaterialMetalness(0.0);
        break;
      case 'chrome':
        setMaterialColor('#f1f5f9');
        setMaterialRoughness(0.05);
        setMaterialMetalness(0.95);
        break;
      case 'gold':
        setMaterialColor('#eab308');
        setMaterialRoughness(0.15);
        setMaterialMetalness(0.85);
        break;
      case 'hologram':
        setMaterialColor('#06b6d4');
        setMaterialRoughness(0.2);
        setMaterialMetalness(0.5);
        break;
      case 'plastic':
        setMaterialColor('#ef4444');
        setMaterialRoughness(0.4);
        setMaterialMetalness(0.1);
        break;
    }
    triggerToast(`Applied ${preset} material preset.`);
  };

  // Get dynamic vertex count stats per stage
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
    <div className="flex flex-col h-full w-full bg-[var(--brand-bg)] text-white select-none relative overflow-hidden font-sans">
      
      {/* Navbar Header */}
      <header className="h-14 w-full flex items-center justify-between border-b border-[var(--brand-border)]/80 px-6 bg-[var(--brand-bg)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Box size={16} className="text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-400">3D Modeling Studio</span>
            <span className="text-[10px] text-slate-500 font-medium">Model: {name}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
            <span className="text-[10px] text-slate-300 font-medium">Cloud Credits: 27 remaining</span>
          </div>
          <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center cursor-pointer hover:bg-slate-800 transition-all">
            <Eye size={14} className="text-slate-400" />
          </div>
        </div>
      </header>

      {/* Main workspace layout */}
      <div className="flex-1 flex relative overflow-hidden min-h-0">
        
        {/* LEFT VERTICAL STEP NAVIGATION */}
        <nav className="w-[220px] border-r border-[var(--brand-border)]/80 bg-[var(--brand-bg)]/90 flex flex-col p-3 space-y-1.5 z-10 shrink-0 relative">
          <div className="px-2.5 py-1 mb-1 select-none">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Pipeline Stages</span>
          </div>

          <div className="flex-1 flex flex-col space-y-1.5 overflow-y-auto relative custom-scrollbar">
            {STAGES.map((s, index) => {
              const isActive = activeStage === s.id;
              const isCompleted = activeStage > s.id;
              
              return (
                <div key={s.id} className="relative flex flex-col">
                  {/* Timeline connector line */}
                  {index < STAGES.length - 1 && (
                    <div className={`studio-timeline-connector ${isCompleted ? 'completed' : ''}`} />
                  )}

                  <button
                    onClick={() => {
                      setActiveStage(s.id);
                      if (s.id >= 6 && shadingMode === 'clay') {
                        setShadingMode('flat');
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 cursor-pointer border relative z-10 ${
                      isActive
                        ? 'bg-gradient-to-r from-sky-950/50 to-sky-900/10 border-sky-500/40 text-white font-semibold shadow-inner'
                        : 'border-transparent text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 flex items-center justify-center rounded-lg shrink-0 transition-all ${
                        isActive
                          ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                          : isCompleted
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-slate-900/80 text-slate-500 border border-slate-800'
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 size={14} /> : <s.Icon size={14} />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] leading-tight font-medium truncate">{s.label}</span>
                      <span className="text-[8px] text-slate-500 leading-none mt-0.5">Step 0{s.id} of 08</span>
                    </div>

                    {isActive && (
                      <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </nav>

        {/* FLOATING ACTION PARAMETERS CARD (LEFT) */}
        <div className="absolute left-[236px] top-4 w-[300px] max-h-[calc(100%-32px)] studio-glass rounded-2xl p-4 flex flex-col gap-4 shadow-2xl z-20 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between border-b border-[var(--brand-border)] pb-2.5">
            <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
              {STAGES[activeStage - 1].label}
            </span>
            <span className="text-[9px] text-slate-500 font-mono">Stage 0{activeStage}</span>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed bg-slate-950/40 rounded-xl p-3 border border-[var(--brand-border)]">
            {STAGES[activeStage - 1].desc}
          </p>

          {/* STAGE 1 PANEL: Concept Design */}
          {activeStage === 1 && (
            <div className="flex flex-col gap-3">
              <div className="flex rounded-lg bg-slate-950 p-1 border border-[var(--brand-border)]">
                <button
                  onClick={() => setConceptTab('text')}
                  className={`flex-1 py-1.5 text-[9px] font-bold rounded-md transition-all ${
                    conceptTab === 'text' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Text to Multi-View
                </button>
                <button
                  onClick={() => setConceptTab('image')}
                  className={`flex-1 py-1.5 text-[9px] font-bold rounded-md transition-all ${
                    conceptTab === 'image' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Image to Multi-View
                </button>
              </div>

              {conceptTab === 'text' ? (
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Prompt Text</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    placeholder="Enter style, description, character look..."
                    className="w-full rounded-lg border border-[var(--brand-border)] bg-slate-950/40 px-3 py-2 text-[10px] text-white outline-none focus:border-sky-500/50 resize-none font-mono"
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
                    className="w-full h-28 border border-dashed border-[var(--brand-border)] hover:border-sky-500/40 bg-slate-950/30 rounded-xl flex flex-col items-center justify-center gap-2 transition-all text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    <Upload size={20} className="text-sky-400 animate-bounce" />
                    <span className="text-[9px] font-bold">Upload Concept Image</span>
                    <span className="text-[7px] text-slate-500 px-4 text-center leading-normal">
                      PNG, JPG, WEBP formats. Max size 10MB. Requires clear resolution for best multi-view synthesis.
                    </span>
                  </button>
                  {conceptImage && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-950/30 border border-sky-500/20 text-[9px] text-sky-300 truncate">
                      <CheckCircle2 size={12} className="shrink-0 text-sky-400" />
                      <span className="truncate">{conceptImage.split(/[\\/]/).pop()}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Pose toggle */}
              <div className="flex items-center justify-between py-2 bg-slate-950/30 rounded-lg px-3 border border-[var(--brand-border)]">
                <span className="text-[9px] text-slate-400 font-medium">Standardized A-Pose Model</span>
                <input
                  type="checkbox"
                  checked={aPose}
                  onChange={(e) => setAPose(e.target.checked)}
                  className="rounded bg-[var(--brand-bg)] border-[var(--brand-border)] text-sky-500 focus:ring-0 w-3.5 h-3.5"
                />
              </div>

              {/* Stylization selector */}
              <div className="relative">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1 block">Stylization Preset</label>
                <button
                  onClick={() => setStylizeOpen(!stylizeOpen)}
                  className="w-full flex items-center justify-between rounded-lg border border-[var(--brand-border)] bg-slate-950/40 px-3 py-2 text-[10px] text-white hover:bg-slate-900 text-left outline-none cursor-pointer"
                >
                  <span className="truncate font-medium">{stylization}</span>
                  <ChevronDown size={12} className="text-slate-500" />
                </button>

                {stylizeOpen && (
                  <div className="absolute left-0 right-0 mt-1.5 rounded-xl bg-slate-900 border border-slate-800 p-2 shadow-2xl grid grid-cols-2 gap-1.5 z-30 max-h-56 overflow-y-auto custom-scrollbar">
                    {[
                      { name: 'Chibi', color: 'bg-pink-500' },
                      { name: 'Steampunk', color: 'bg-amber-600' },
                      { name: 'Futurism', color: 'bg-sky-600' },
                      { name: 'Pixelation', color: 'bg-violet-500' },
                      { name: 'Hand-drawn', color: 'bg-rose-500' },
                      { name: 'Low polygon', color: 'bg-emerald-500' }
                    ].map((st) => (
                      <button
                        key={st.name}
                        onClick={() => {
                          setStylization(st.name);
                          setStylizeOpen(false);
                          triggerToast(`Selected ${st.name} stylization preset.`);
                        }}
                        className={`p-2 rounded-lg flex flex-col gap-1 text-[9px] font-medium text-left border ${
                          stylization === st.name ? 'border-sky-500 bg-sky-500/20' : 'border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        <div className={`w-full h-8 rounded ${st.color} opacity-40 shrink-0 flex items-center justify-center text-[7px] text-white font-bold uppercase tracking-wider`}>
                          {st.name.slice(0, 4)}
                        </div>
                        <span className="truncate text-slate-300 mt-1">{st.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Save concept button */}
              <button
                onClick={() => setActiveStage(2)}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-[10px] tracking-wide uppercase shadow-lg shadow-sky-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <Sparkles size={12} />
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
                  className="w-full rounded-lg border border-[var(--brand-border)] bg-slate-950/40 px-3 py-2 text-[10px] text-white outline-none cursor-pointer"
                >
                  <option value="Concept Design">Concept Design: {name}</option>
                  <option value="local">Upload Local Multi-View Images</option>
                </select>
              </div>

              {geometrySource !== 'Concept Design' && (
                <div className="flex flex-col gap-1.5">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 px-2 py-2 rounded-lg border border-[var(--brand-border)] bg-slate-950/40 cursor-pointer hover:bg-slate-900">
                      <input
                        type="radio"
                        name="upload"
                        checked={uploadMode === 'single'}
                        onChange={() => setUploadMode('single')}
                        className="text-sky-500 focus:ring-0 w-3 h-3"
                      />
                      <span className="text-[9px] text-slate-300 font-medium">Single Image</span>
                    </label>
                    <label className="flex items-center gap-2 px-2 py-2 rounded-lg border border-[var(--brand-border)] bg-slate-950/40 cursor-pointer hover:bg-slate-900">
                      <input
                        type="radio"
                        name="upload"
                        checked={uploadMode === 'multiple'}
                        onChange={() => setUploadMode('multiple')}
                        className="text-sky-500 focus:ring-0 w-3 h-3"
                      />
                      <span className="text-[9px] text-slate-300 font-medium">Multi-View Grid</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 bg-slate-950/40 rounded-xl p-3 border border-[var(--brand-border)]">
                <div className="text-[9px] text-slate-500 font-semibold mb-1">Active Concept Mapping:</div>
                <div className="text-[9px] text-slate-300 truncate"><span className="text-slate-500 font-medium">Name:</span> {name}</div>
                <div className="text-[9px] text-slate-300 truncate"><span className="text-slate-500 font-medium">Style:</span> {stylization}</div>
                <div className="text-[9px] text-slate-300 truncate"><span className="text-slate-500 font-medium">Prompt:</span> {prompt}</div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Select AI Model</label>
                <div className="relative">
                  <select
                    value={modelType}
                    onChange={(e) => setModelType(e.target.value)}
                    className="w-full rounded-lg border border-[var(--brand-border)] bg-slate-950/40 px-3 py-2 text-[10px] text-white outline-none cursor-pointer"
                  >
                    <option value="3D Generation - V3.1">3D Generation - V3.1 (Latest)</option>
                    <option value="3D Generation - V3.0">3D Generation - V3.0</option>
                    <option value="Legacy Alpha V2">Legacy Alpha V2</option>
                  </select>
                  <span className="absolute right-8 top-2 px-1.5 bg-sky-950 text-[7px] text-sky-400 font-bold rounded">NEW</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Target Poly Count</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['1.5M', '1M', '500k', '50k'] as const).map((faces) => (
                    <button
                      key={faces}
                      onClick={() => setFaceCount(faces)}
                      className={`py-1.5 text-[9px] font-bold rounded-lg border ${
                        faceCount === faces
                          ? 'border-sky-500 bg-sky-500/20 text-sky-400'
                          : 'border-slate-800 bg-slate-950/30 text-slate-400 hover:bg-slate-900 cursor-pointer'
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
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold text-[10px] tracking-wide uppercase disabled:opacity-60 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {generating ? <RefreshCw size={12} className="animate-spin" /> : <Wand2 size={12} />}
                <span>{generating ? 'Rebuilding Mesh...' : 'Generate 3D Model'}</span>
              </button>

              {result && (
                <div className={`p-3 rounded-xl flex items-start gap-2 text-[9px] ${
                  result.ok ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                }`}>
                  <Info size={13} className="shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold block mb-0.5">{result.ok ? 'Generation Successful' : 'Generation Error'}</span>
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
                <select className="w-full rounded-lg border border-[var(--brand-border)] bg-slate-950/40 px-3 py-2 text-[10px] text-white outline-none">
                  <option>Local active workspace model / {name}.glb</option>
                </select>
              </div>

              <div className="w-full h-32 border border-[var(--brand-border)] rounded-xl bg-slate-950/30 relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-sky-500/10 via-transparent to-transparent opacity-70" />
                <div className="w-14 h-24 rounded-full border border-sky-500/20 bg-sky-500/10 flex flex-col items-center justify-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-sky-500/30 border border-sky-400/20" />
                  <div className="w-10 h-12 rounded bg-sky-500/20 border border-sky-400/10" />
                </div>
              </div>

              <button
                onClick={() => {
                  triggerToast('AI segmentation completed. Colored segments represent isolated body nodes.', 'info');
                  setShadingMode('flat');
                }}
                className="w-full py-2 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-[10px] tracking-wide uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Layers size={12} />
                <span>Segment Mesh Components</span>
              </button>
            </div>
          )}

          {/* STAGE 4 PANEL: Low-mode topology */}
          {activeStage === 4 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Retopology Source</label>
                <select className="w-full rounded-lg border border-[var(--brand-border)] bg-slate-950/40 px-3 py-2 text-[10px] text-white outline-none">
                  <option>Active High-Poly Mesh / {name}.glb</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Retopology Presets</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: '5k faces (Mobile)', count: 'low' },
                    { label: '10k faces (Standard)', count: 'med-low' },
                    { label: '20k faces (Desktop)', count: 'medium' },
                    { label: '50k faces (High-Detail)', count: 'high' }
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        triggerToast(`Decimation target configured for ${preset.label}.`);
                      }}
                      className="py-2 rounded-lg border border-[var(--brand-border)] bg-slate-950/40 text-[9px] text-slate-300 font-medium hover:bg-slate-900 cursor-pointer text-center"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => triggerToast('Mesh retopology decimation completed. Output optimized by 98.2%.', 'info')}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-[10px] tracking-wide uppercase transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <Sliders size={12} />
                <span>Optimize Mesh Topology</span>
              </button>
            </div>
          )}

          {/* STAGE 5 PANEL: UV Exposure */}
          {activeStage === 5 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">UV Mapping Target</label>
                <select className="w-full rounded-lg border border-[var(--brand-border)] bg-slate-950/40 px-3 py-2 text-[10px] text-white outline-none">
                  <option>Active Optimized Mesh / {name}.glb</option>
                </select>
              </div>

              <div className="flex flex-col gap-2 rounded-xl bg-slate-950/40 p-3 border border-[var(--brand-border)]">
                <div className="text-[9px] text-slate-500 font-semibold mb-1">Projection Parameters:</div>
                <label className="flex items-center gap-2.5 text-[9px] text-slate-400">
                  <input type="checkbox" defaultChecked className="rounded text-sky-500 w-3.5 h-3.5 bg-black border-slate-800 focus:ring-0" />
                  <span>Smart seam placement placement</span>
                </label>
                <label className="flex items-center gap-2.5 text-[9px] text-slate-400">
                  <input type="checkbox" defaultChecked className="rounded text-sky-500 w-3.5 h-3.5 bg-black border-slate-800 focus:ring-0" />
                  <span>Map UV island margins proportionally</span>
                </label>
              </div>

              <button
                onClick={() => triggerToast('UV Unwrap generated. 34 islands compiled.', 'info')}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-[10px] tracking-wide uppercase transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <Maximize2 size={12} />
                <span>Generate UV Map</span>
              </button>
            </div>
          )}

          {/* STAGE 6 PANEL: Texture painting */}
          {activeStage === 6 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Texture Baking Target</label>
                <select className="w-full rounded-lg border border-[var(--brand-border)] bg-slate-950/40 px-3 py-2 text-[10px] text-white outline-none">
                  <option>Unwrapped Mesh Model / {name}.glb</option>
                </select>
              </div>

              <div className="flex flex-col gap-2 rounded-xl bg-slate-950/40 p-3 border border-[var(--brand-border)] space-y-1">
                <span className="text-[9px] text-slate-500 font-semibold mb-1">Color Palette:</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {['#f43f5e', '#10b981', '#3b82f6', '#eab308', '#ffffff', '#0f172a'].map((color) => (
                    <button
                      key={color}
                      className="w-6 h-6 rounded-full border border-slate-700 cursor-pointer transition-all active:scale-90"
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        setMaterialColor(color);
                        triggerToast(`Applied paint color ${color}.`);
                      }}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={() => {
                  setShadingMode('textured');
                  triggerToast('Color map baked successfully.', 'info');
                }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-[10px] tracking-wide uppercase transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <PaintBucket size={12} />
                <span>Bake Texture Map</span>
              </button>
            </div>
          )}

          {/* STAGE 7 PANEL: Bone binding */}
          {activeStage === 7 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Rigging Coordinate Target</label>
                <select className="w-full rounded-lg border border-[var(--brand-border)] bg-slate-950/40 px-3 py-2 text-[10px] text-white outline-none">
                  <option>Segmented Mesh Model / {name}.glb</option>
                </select>
              </div>

              <div className="w-full h-32 border border-[var(--brand-border)] rounded-xl bg-slate-950/30 relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-sky-500/10 via-transparent to-transparent opacity-70" />
                <div className="relative w-12 h-24 flex flex-col items-center">
                  <div className="w-3.5 h-3.5 rounded-full bg-sky-400 border border-white animate-pulse" />
                  <div className="w-0.5 h-16 bg-sky-400 relative">
                    <div className="absolute top-4 left-[-16px] right-[-16px] h-0.5 bg-sky-400" />
                    <div className="absolute top-4 left-[-18px] w-2 h-2 rounded-full bg-sky-400 border border-white" />
                    <div className="absolute top-4 right-[-18px] w-2 h-2 rounded-full bg-sky-400 border border-white" />
                    <div className="absolute bottom-0 left-[-12px] right-[-12px] h-0.5 bg-sky-400" />
                    <div className="absolute bottom-0 left-[-14px] w-2 h-2 rounded-full bg-sky-400 border border-white" />
                    <div className="absolute bottom-0 right-[-14px] w-2 h-2 rounded-full bg-sky-400 border border-white" />
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  triggerToast('Rigging skeletal architecture generated.', 'info');
                }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-[10px] tracking-wide uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Bone size={12} />
                <span>Generate Rig Bones</span>
              </button>
            </div>
          )}

          {/* STAGE 8 PANEL: Animation generation */}
          {activeStage === 8 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Animation Target</label>
                <select className="w-full rounded-lg border border-[var(--brand-border)] bg-slate-950/40 px-3 py-2 text-[10px] text-white outline-none">
                  <option>Rigged Mesh Model / {name}.glb</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Skeletal Action Clip</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['idle', 'walk', 'wave', 'dance'] as const).map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setAnimationPreset(preset)}
                      className={`py-2 rounded-lg border text-[9px] font-bold uppercase tracking-wider transition-all ${
                        animationPreset === preset
                          ? 'border-sky-500 bg-sky-500/20 text-sky-400 shadow-lg'
                          : 'border-slate-800 bg-slate-950/30 text-slate-400 hover:bg-slate-900 cursor-pointer'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Animation Speed slider */}
              <div className="flex flex-col gap-1.5 py-1">
                <div className="flex justify-between items-center text-[9px] text-slate-400">
                  <span>Playback Speed</span>
                  <span className="font-mono text-sky-400">{animationSpeed.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.25"
                  max="2.5"
                  step="0.05"
                  value={animationSpeed}
                  onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
                  className="w-full accent-sky-500 bg-slate-950 h-1 rounded-lg outline-none cursor-pointer"
                />
              </div>

              {/* Play Pause button */}
              <button
                onClick={() => setIsAnimating(!isAnimating)}
                className={`w-full py-1.5 rounded-lg border text-[9px] font-bold uppercase tracking-wider transition-all ${
                  isAnimating ? 'border-sky-500 text-sky-400' : 'border-slate-700 text-slate-400'
                }`}
              >
                {isAnimating ? 'Pause Animation' : 'Play Animation'}
              </button>

              {result?.ok && result.path ? (
                <div className="flex flex-col gap-2 pt-3 border-t border-slate-800 mt-1">
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 size={13} className="shrink-0" />
                    <span>Compiled model artifact ready on local disk.</span>
                  </div>
                  <button
                    onClick={() => handleImportToPet()}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-bold text-[10px] tracking-wide uppercase transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20"
                  >
                    <Play size={12} />
                    <span>Launch Companion Pet</span>
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800 text-[8px] text-slate-500 leading-relaxed">
                  <span className="font-semibold block mb-0.5 text-slate-400">Export note:</span>
                  To finalize and deploy this character companion, complete the Generation in Stage 2.
                </div>
              )}
            </div>
          )}
        </div>

        {/* THREE.JS INTERACTIVE 3D VIEWPORT CANVAS */}
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
                onClick={() => setShowGrid(!showGrid)}
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
                onClick={() => setAutoRotate(!autoRotate)}
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
                  onClick={() => setShadingMode(sh.mode as any)}
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

        {/* RIGHT SIDEBAR PANEL */}
        <aside className="w-[260px] border-l border-[var(--brand-border)]/80 bg-[var(--brand-bg)]/90 flex flex-col z-10 shrink-0 select-none">
          {/* Side tabs */}
          <div className="flex border-b border-[var(--brand-border)] p-1 bg-slate-950">
            {[
              { id: 'library', Icon: FolderOpen },
              { id: 'scene', Icon: Layers },
              { id: 'transform', Icon: Move },
              { id: 'material', Icon: Palette }
            ].map((tab) => {
              const isSelected = rightSidebarTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setRightSidebarTab(tab.id as any)}
                  className={`flex-1 py-2 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800 text-white border border-slate-700'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                  title={tab.id.toUpperCase()}
                >
                  <tab.Icon size={14} />
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-4">
            
            {/* LIBRARY TAB */}
            {rightSidebarTab === 'library' && (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Model History</span>
                  <button
                    onClick={handleImportExternalModel}
                    className="p-1 hover:bg-slate-800 rounded text-sky-400 hover:text-sky-300 border border-slate-800 cursor-pointer"
                    title="Import external GLTF/GLB"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                
                {savedModels.length === 0 ? (
                  <div className="text-[9px] text-slate-500 text-center py-6 border border-dashed border-slate-800 rounded-lg">
                    No models generated yet.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {savedModels.map((m) => (
                      <div
                        key={m.path}
                        onClick={() => handleImportToPet(m.path)}
                        className="rounded-lg p-2.5 border border-slate-800 bg-slate-950/30 hover:bg-slate-900/60 cursor-pointer transition-all flex items-center justify-between group"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="text-[9px] font-semibold text-slate-300 truncate">{m.name}</span>
                          <div className="flex gap-1.5 items-center mt-1">
                            <span className="text-[7px] bg-slate-800 text-slate-400 px-1 py-0.25 rounded font-mono uppercase">{m.format}</span>
                            <span className="text-[7px] text-slate-500">{(m.size / 1024 / 1024).toFixed(2)} MB</span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDeleteModel(m.path, e)}
                          className="p-1 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2">Model Templates</div>
                <div className="grid grid-cols-2 gap-2">
                  {PRESETS.map((pr) => {
                    const isSelected = selectedPresetId === pr.id;
                    return (
                      <button
                        key={pr.id}
                        onClick={() => handlePresetSelect(pr.id, pr.name)}
                        className={`rounded-lg p-2 border text-left transition-all ${
                          isSelected
                            ? 'border-sky-500 bg-sky-500/20'
                            : 'border-slate-850 bg-slate-950/30 hover:bg-slate-900 cursor-pointer'
                        }`}
                      >
                        <div className={`w-full h-12 rounded bg-gradient-to-br ${
                          pr.img === 'chibi' ? 'from-pink-500/20 to-purple-500/20 border-pink-500/10' :
                          pr.img === 'steampunk' ? 'from-amber-500/20 to-orange-500/20 border-amber-500/10' :
                          pr.img === 'robot' ? 'from-sky-500/20 to-indigo-500/20 border-sky-500/10' :
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
              </div>
            )}

            {/* SCENE HIERARCHY TAB */}
            {rightSidebarTab === 'scene' && (
              <div className="flex flex-col gap-2 text-[9px] text-slate-400 font-mono">
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest font-sans mb-1">Mesh Hierarchy</div>
                <div className="flex items-center gap-1.5 text-sky-400"><Layers size={10} /> <span>root_scene</span></div>
                <div className="pl-3 flex items-center gap-1.5 text-slate-300"><Layers size={10} /> <span>Luna_Group</span></div>
                
                {[
                  { id: 'head_mesh', label: 'head_mesh', icon: Box },
                  { id: 'torso_mesh', label: 'torso_mesh', icon: Box },
                  { id: 'skirt_mesh', label: 'skirt_mesh', icon: Box },
                  { id: 'hair_clumps', label: 'hair_clumps', icon: Box },
                  { id: 'arm_joints_L', label: 'arm_joints_L', icon: Bone },
                  { id: 'arm_joints_R', label: 'arm_joints_R', icon: Bone },
                  { id: 'leg_joints_L', label: 'leg_joints_L', icon: Bone },
                  { id: 'leg_joints_R', label: 'leg_joints_R', icon: Bone }
                ].map((item) => {
                  const Icon = item.icon;
                  const isVisible = visibleNodes[item.id] !== false;
                  return (
                    <div key={item.id} className="pl-6 flex items-center justify-between hover:bg-slate-900/50 py-0.5 rounded pr-1 group">
                      <div className="flex items-center gap-1.5 text-slate-500 group-hover:text-slate-300 transition-colors">
                        <Icon size={10} />
                        <span>{item.label}</span>
                      </div>
                      <button
                        onClick={() => {
                          setVisibleNodes({
                            ...visibleNodes,
                            [item.id]: !isVisible
                          });
                        }}
                        className="text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
                      >
                        {isVisible ? <Eye size={10} /> : <EyeOff size={10} className="text-slate-700" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TRANSFORM INSPECTOR TAB */}
            {rightSidebarTab === 'transform' && (
              <div className="flex flex-col gap-4 text-[9px] text-slate-400">
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Transform Inspector</div>
                
                {/* Position Row */}
                <div className="flex flex-col gap-1.5 border-b border-slate-900 pb-3">
                  <span className="text-slate-500 font-semibold uppercase tracking-wider text-[8px]">Position</span>
                  <div className="grid grid-cols-3 gap-2">
                    {['x', 'y', 'z'].map((axis) => (
                      <div key={axis} className="flex items-center bg-slate-950 border border-slate-800 rounded px-1.5 py-1">
                        <span className="text-[8px] text-rose-500 uppercase font-bold mr-1.5">{axis}</span>
                        <input
                          type="number"
                          step="0.05"
                          value={(modelPosition as any)[axis]}
                          onChange={(e) => setModelPosition({ ...modelPosition, [axis]: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-transparent border-none text-[9px] outline-none text-slate-300 text-right font-mono"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rotation Row */}
                <div className="flex flex-col gap-1.5 border-b border-slate-900 pb-3">
                  <span className="text-slate-500 font-semibold uppercase tracking-wider text-[8px]">Rotation (deg)</span>
                  <div className="grid grid-cols-3 gap-2">
                    {['x', 'y', 'z'].map((axis) => (
                      <div key={axis} className="flex items-center bg-slate-950 border border-slate-800 rounded px-1.5 py-1">
                        <span className="text-[8px] text-emerald-500 uppercase font-bold mr-1.5">{axis}</span>
                        <input
                          type="number"
                          step="5"
                          value={(modelRotation as any)[axis]}
                          onChange={(e) => setModelRotation({ ...modelRotation, [axis]: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-transparent border-none text-[9px] outline-none text-slate-300 text-right font-mono"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scale Row */}
                <div className="flex flex-col gap-1.5 pb-2">
                  <span className="text-slate-500 font-semibold uppercase tracking-wider text-[8px]">Scale</span>
                  <div className="grid grid-cols-3 gap-2">
                    {['x', 'y', 'z'].map((axis) => (
                      <div key={axis} className="flex items-center bg-slate-950 border border-slate-800 rounded px-1.5 py-1">
                        <span className="text-[8px] text-sky-500 uppercase font-bold mr-1.5">{axis}</span>
                        <input
                          type="number"
                          step="0.1"
                          value={(modelScale as any)[axis]}
                          onChange={(e) => setModelScale({ ...modelScale, [axis]: parseFloat(e.target.value) || 1 })}
                          className="w-full bg-transparent border-none text-[9px] outline-none text-slate-300 text-right font-mono"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setModelPosition({ x: 0, y: 0, z: 0 });
                    setModelRotation({ x: 0, y: 0, z: 0 });
                    setModelScale({ x: 1, y: 1, z: 1 });
                    triggerToast('Transforms reset to default.');
                  }}
                  className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[8px] uppercase tracking-wider font-semibold cursor-pointer text-center"
                >
                  Reset Transforms
                </button>
              </div>
            )}

            {/* MATERIAL EDITOR TAB */}
            {rightSidebarTab === 'material' && (
              <div className="flex flex-col gap-3 text-[9px] text-slate-400">
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Material Editor</div>
                
                {/* Base Color picker */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-slate-500 font-semibold uppercase tracking-wider text-[8px]">Base Color</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={materialColor}
                      onChange={(e) => setMaterialColor(e.target.value)}
                      className="w-8 h-8 rounded border border-slate-800 bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={materialColor}
                      onChange={(e) => setMaterialColor(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-[9px] outline-none text-slate-300 font-mono"
                    />
                  </div>
                </div>

                {/* Roughness slider */}
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex justify-between items-center text-[8px] uppercase tracking-wider font-semibold text-slate-500">
                    <span>Roughness</span>
                    <span className="font-mono text-slate-400">{materialRoughness.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={materialRoughness}
                    onChange={(e) => setMaterialRoughness(parseFloat(e.target.value))}
                    className="w-full accent-sky-500 bg-slate-950 h-1 rounded-lg outline-none cursor-pointer"
                  />
                </div>

                {/* Metalness slider */}
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex justify-between items-center text-[8px] uppercase tracking-wider font-semibold text-slate-500">
                    <span>Metalness</span>
                    <span className="font-mono text-slate-400">{materialMetalness.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={materialMetalness}
                    onChange={(e) => setMaterialMetalness(parseFloat(e.target.value))}
                    className="w-full accent-sky-500 bg-slate-950 h-1 rounded-lg outline-none cursor-pointer"
                  />
                </div>

                {/* Material Quick Presets */}
                <div className="flex flex-col gap-1.5 mt-2">
                  <span className="text-slate-500 font-semibold uppercase tracking-wider text-[8px]">Material Presets</span>
                  <div className="flex flex-col gap-1">
                    {(['clay', 'chrome', 'gold', 'hologram', 'plastic'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => applyMaterialPreset(p)}
                        className="w-full py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-900 rounded text-slate-400 hover:text-slate-200 text-[8px] uppercase tracking-wider font-mono font-semibold transition-all cursor-pointer"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Batch operations */}
          <div className="p-3 border-t border-[var(--brand-border)]/80 bg-slate-950 flex items-center justify-between mt-auto">
            <button
              onClick={() => triggerToast('Batch Export queued.')}
              className="w-full py-2 bg-[var(--brand-bg)] hover:bg-[var(--brand-hover)] transition-all rounded-lg text-[8px] font-bold uppercase tracking-wider text-slate-400 hover:text-white border border-[var(--brand-border)] cursor-pointer text-center"
            >
              Batch Export
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ThreeDStudio;
