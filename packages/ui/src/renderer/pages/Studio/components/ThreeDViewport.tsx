import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import {
  Grid,
  Compass,
  Download,
  Share2,
  Layers,
  Box,
  Maximize2,
  RotateCcw,
  Camera,
  Footprints,
  Eye,
  Sun,
  ShieldAlert,
} from 'lucide-react';
import {
  CameraMode,
  EnvironmentPreset,
  MeshStats,
  SceneNodeInfo,
  ShadingMode,
  TransformState,
} from './types';

export interface ThreeDViewportProps {
  modelUrl: string | null;
  modelFormat?: string;
  cameraMode: CameraMode;
  onCameraModeChange: (mode: CameraMode) => void;
  shadingMode: ShadingMode;
  onShadingModeChange: (mode: ShadingMode) => void;
  environmentPreset: EnvironmentPreset;
  onEnvironmentPresetChange: (preset: EnvironmentPreset) => void;
  showGrid: boolean;
  onShowGridChange: (val: boolean) => void;
  showShadows: boolean;
  onShowShadowsChange: (val: boolean) => void;
  autoRotate: boolean;
  onAutoRotateChange: (val: boolean) => void;
  modelPosition: TransformState;
  modelRotation: TransformState;
  modelScale: TransformState;
  onStatsLoaded?: (stats: MeshStats) => void;
  onSceneHierarchyLoaded?: (nodes: SceneNodeInfo[]) => void;
  triggerToast?: (msg: string, type?: 'info' | 'error') => void;
}

export const ThreeDViewport: React.FC<ThreeDViewportProps> = ({
  modelUrl,
  modelFormat = 'glb',
  cameraMode,
  onCameraModeChange,
  shadingMode,
  onShadingModeChange,
  environmentPreset,
  onEnvironmentPresetChange,
  showGrid,
  onShowGridChange,
  showShadows,
  onShowShadowsChange,
  autoRotate,
  onAutoRotateChange,
  modelPosition,
  modelRotation,
  modelScale,
  onStatsLoaded,
  onSceneHierarchyLoaded,
  triggerToast,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Walkthrough keyboard movement state
  const keysPressed = useRef<Record<string, boolean>>({});

  // ── Snap to Orthographic Angle Views ──
  const snapToView = useCallback(
    (view: 'front' | 'back' | 'left' | 'right' | 'top' | 'isometric' | 'reset') => {
      if (!cameraRef.current || !controlsRef.current) return;
      const distance = 6.0;
      controlsRef.current.target.set(0, 1.0, 0);

      switch (view) {
        case 'front':
          cameraRef.current.position.set(0, 1.0, distance);
          break;
        case 'back':
          cameraRef.current.position.set(0, 1.0, -distance);
          break;
        case 'left':
          cameraRef.current.position.set(-distance, 1.0, 0);
          break;
        case 'right':
          cameraRef.current.position.set(distance, 1.0, 0);
          break;
        case 'top':
          cameraRef.current.position.set(0, distance + 1.0, 0.001);
          break;
        case 'isometric':
          cameraRef.current.position.set(distance * 0.7, distance * 0.7, distance * 0.7);
          break;
        case 'reset':
        default:
          cameraRef.current.position.set(3.5, 3.0, 5.0);
          controlsRef.current.target.set(0, 1.0, 0);
          break;
      }
      controlsRef.current.update();
      if (triggerToast) triggerToast(`Camera aligned to ${view}.`);
    },
    [triggerToast]
  );

  // ── Initialize Scene & Renderer ──
  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(4.0, 3.5, 6.0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.5;
    controls.maxDistance = 200;
    controls.target.set(0, 1.0, 0);
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(6, 12, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0001;
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.5);
    rimLight.position.set(-8, 5, -8);
    scene.add(rimLight);

    // Ground Grid
    const grid = new THREE.GridHelper(30, 30, 0x38bdf8, 0x1e293b);
    grid.position.y = 0;
    scene.add(grid);
    gridHelperRef.current = grid;

    // Model Container Group
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    // Resize handler
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement) renderer.domElement.remove();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  // ── First-Person Walkthrough Keyboard Listeners ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // ── Environment Preset Application ──
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    switch (environmentPreset) {
      case 'cyberpunk':
        scene.background = new THREE.Color(0x070913);
        scene.fog = new THREE.FogExp2(0x070913, 0.035);
        if (dirLightRef.current) dirLightRef.current.color.setHex(0xa855f7);
        break;
      case 'sunset':
        scene.background = new THREE.Color(0x2d1727);
        scene.fog = new THREE.FogExp2(0x2d1727, 0.02);
        if (dirLightRef.current) dirLightRef.current.color.setHex(0xf97316);
        break;
      case 'space':
        scene.background = new THREE.Color(0x010206);
        scene.fog = null;
        if (dirLightRef.current) dirLightRef.current.color.setHex(0xffffff);
        break;
      case 'grid':
        scene.background = new THREE.Color(0x0f172a);
        scene.fog = null;
        if (dirLightRef.current) dirLightRef.current.color.setHex(0x38bdf8);
        break;
      case 'neutral':
      default:
        scene.background = new THREE.Color(0x13151b);
        scene.fog = null;
        if (dirLightRef.current) dirLightRef.current.color.setHex(0xffffff);
        break;
    }
  }, [environmentPreset]);

  // ── Visibility & Shadow Toggles ──
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
    if (dirLightRef.current) {
      dirLightRef.current.castShadow = showShadows;
    }
  }, [showGrid, showShadows]);

  // ── Transforms Binding ──
  useEffect(() => {
    if (!modelGroupRef.current) return;
    modelGroupRef.current.position.set(modelPosition.x, modelPosition.y, modelPosition.z);
    modelGroupRef.current.rotation.set(
      (modelRotation.x * Math.PI) / 180,
      (modelRotation.y * Math.PI) / 180,
      (modelRotation.z * Math.PI) / 180
    );
    modelGroupRef.current.scale.set(modelScale.x, modelScale.y, modelScale.z);
  }, [modelPosition, modelRotation, modelScale]);

  // ── Load Real 3D Model ──
  useEffect(() => {
    const modelGroup = modelGroupRef.current;
    if (!modelGroup) return;

    // Clear previous children
    while (modelGroup.children.length > 0) {
      const child = modelGroup.children[0];
      modelGroup.remove(child);
    }
    mixerRef.current = null;
    setLoadError(null);

    if (!modelUrl) {
      // Default preview: sleek geometric studio origin anchor
      const boxGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
      const wireGeo = new THREE.WireframeGeometry(boxGeo);
      const wire = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x38bdf8 }));
      wire.position.y = 0.6;
      modelGroup.add(wire);
      return;
    }

    setIsLoading(true);

    const applyShading = (object: THREE.Object3D) => {
      object.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          if (shadingMode === 'clay') {
            mesh.material = new THREE.MeshStandardMaterial({
              color: 0x94a3b8,
              roughness: 0.6,
              metalness: 0.1,
            });
          } else if (shadingMode === 'wireframe') {
            mesh.material = new THREE.MeshStandardMaterial({
              color: 0x38bdf8,
              wireframe: true,
            });
          } else if (shadingMode === 'normals') {
            mesh.material = new THREE.MeshNormalMaterial();
          }
        }
      });
    };

    const processLoadedObject = (object: THREE.Object3D, animations?: THREE.AnimationClip[]) => {
      applyShading(object);
      modelGroup.add(object);

      // Animation playback if model contains clips
      if (animations && animations.length > 0) {
        const mixer = new THREE.AnimationMixer(object);
        animations.forEach((clip) => mixer.clipAction(clip).play());
        mixerRef.current = mixer;
      }

      // Compute statistics & hierarchy
      let vertexCount = 0;
      let triangleCount = 0;
      const nodes: SceneNodeInfo[] = [];

      object.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          const geom = m.geometry;
          if (geom) {
            const pos = geom.getAttribute('position');
            if (pos) vertexCount += pos.count;
            if (geom.index) {
              triangleCount += geom.index.count / 3;
            } else if (pos) {
              triangleCount += pos.count / 3;
            }
          }
          nodes.push({
            id: m.uuid,
            name: m.name || 'MeshNode',
            type: 'mesh',
            visible: true,
            polyCount: Math.round(triangleCount),
          });
        }
      });

      const box = new THREE.Box3().setFromObject(object);
      const size = new THREE.Vector3();
      box.getSize(size);

      if (onStatsLoaded) {
        onStatsLoaded({
          vertices: vertexCount,
          triangles: Math.round(triangleCount),
          boundingBox: { width: +size.x.toFixed(2), height: +size.y.toFixed(2), depth: +size.z.toFixed(2) },
          drawCalls: nodes.length,
        });
      }

      if (onSceneHierarchyLoaded) {
        onSceneHierarchyLoaded(nodes);
      }

      setIsLoading(false);
    };

    if (modelFormat === 'obj') {
      const loader = new OBJLoader();
      loader.load(
        modelUrl,
        (obj) => processLoadedObject(obj),
        undefined,
        (err) => {
          console.error('Failed to load OBJ:', err);
          setLoadError('Failed to load OBJ model.');
          setIsLoading(false);
        }
      );
    } else if (modelFormat === 'ply') {
      const loader = new PLYLoader();
      loader.load(
        modelUrl,
        (geometry) => {
          const material = new THREE.PointsMaterial({ size: 0.05, vertexColors: true });
          const points = new THREE.Points(geometry, material);
          processLoadedObject(points);
        },
        undefined,
        (err) => {
          console.error('Failed to load PLY:', err);
          setLoadError('Failed to load PLY point cloud.');
          setIsLoading(false);
        }
      );
    } else {
      // Default: GLTF/GLB
      const loader = new GLTFLoader();
      loader.load(
        modelUrl,
        (gltf) => {
          processLoadedObject(gltf.scene, gltf.animations);
        },
        undefined,
        (err) => {
          console.error('Failed to load GLTF/GLB:', err);
          setLoadError('Failed to load GLTF 3D scene.');
          setIsLoading(false);
        }
      );
    }
  }, [modelUrl, modelFormat, shadingMode, onStatsLoaded, onSceneHierarchyLoaded]);

  // ── Render & Walkthrough Animation Loop ──
  useEffect(() => {
    let animId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      const delta = clock.getDelta();

      // Skeletal animation updates
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }

      // Auto-rotation in orbit mode
      if (autoRotate && cameraMode === 'orbit' && modelGroupRef.current) {
        modelGroupRef.current.rotation.y += 0.005;
      }

      // First-Person Walkthrough Movement
      if (cameraMode === 'walkthrough' && cameraRef.current) {
        const speed = 5.0 * delta;
        const forward = new THREE.Vector3();
        cameraRef.current.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3().crossVectors(forward, cameraRef.current.up).normalize();

        if (keysPressed.current['w']) cameraRef.current.position.addScaledVector(forward, speed);
        if (keysPressed.current['s']) cameraRef.current.position.addScaledVector(forward, -speed);
        if (keysPressed.current['d']) cameraRef.current.position.addScaledVector(right, speed);
        if (keysPressed.current['a']) cameraRef.current.position.addScaledVector(right, -speed);
        if (keysPressed.current['e']) cameraRef.current.position.y += speed;
        if (keysPressed.current['q']) cameraRef.current.position.y = Math.max(0.2, cameraRef.current.position.y - speed);

        if (controlsRef.current) {
          controlsRef.current.target.copy(cameraRef.current.position).add(forward);
        }
      } else if (controlsRef.current) {
        controlsRef.current.update();
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      animId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animId);
  }, [autoRotate, cameraMode]);

  // ── Take Screenshot Snapshot ──
  const handleSnapshot = () => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `superagent-3d-snapshot-${Date.now()}.png`;
    a.click();
    if (triggerToast) triggerToast('3D viewport snapshot saved.');
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 relative w-full h-full bg-slate-950 overflow-hidden select-none outline-none"
      tabIndex={0}
    >
      {/* ── Top Viewport HUD Overlay ── */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
        {/* Shading & View Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-slate-800 backdrop-blur-md pointer-events-auto">
          {(['textured', 'clay', 'wireframe', 'normals'] as ShadingMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onShadingModeChange(mode)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                shadingMode === mode
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Camera Navigation Mode & Environment Presets */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Camera Mode (Orbit vs Walkthrough) */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/80 border border-slate-800 backdrop-blur-md">
            <button
              onClick={() => {
                onCameraModeChange('orbit');
                if (triggerToast) triggerToast('Switched to Orbit Camera.');
              }}
              className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                cameraMode === 'orbit'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400/50'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Orbit Camera (Rotate, Pan, Zoom)"
            >
              <Camera size={13} />
              <span>Orbit</span>
            </button>
            <button
              onClick={() => {
                onCameraModeChange('walkthrough');
                if (triggerToast) triggerToast('Walkthrough active: Use WASD to walk, Q/E for elevation.');
              }}
              className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                cameraMode === 'walkthrough'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/50'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="First-Person Walkthrough (WASD navigation at human eye level)"
            >
              <Footprints size={13} />
              <span>Walkthrough</span>
            </button>
          </div>

          {/* Environment Selector */}
          <div className="p-1 rounded-xl bg-slate-900/80 border border-slate-800 backdrop-blur-md">
            <select
              value={environmentPreset}
              onChange={(e) => onEnvironmentPresetChange(e.target.value as EnvironmentPreset)}
              className="bg-transparent text-[11px] font-medium text-slate-300 outline-none px-2 py-0.5 cursor-pointer"
            >
              <option value="neutral" className="bg-slate-900">Studio Neutral</option>
              <option value="cyberpunk" className="bg-slate-900">Cyberpunk Night</option>
              <option value="sunset" className="bg-slate-900">Sunset Glow</option>
              <option value="space" className="bg-slate-900">Deep Space Void</option>
              <option value="grid" className="bg-slate-900">Architectural Grid</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Floating Ortho Snap Cube Controls (Right Top) ── */}
      <div className="absolute top-16 right-3 flex flex-col gap-1 p-1 rounded-xl bg-slate-900/80 border border-slate-800 backdrop-blur-md z-10">
        <button
          onClick={() => snapToView('top')}
          className="p-1.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-center"
          title="Top View"
        >
          TOP
        </button>
        <button
          onClick={() => snapToView('front')}
          className="p-1.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-center"
          title="Front View"
        >
          FRNT
        </button>
        <button
          onClick={() => snapToView('right')}
          className="p-1.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-center"
          title="Right View"
        >
          RGHT
        </button>
        <button
          onClick={() => snapToView('isometric')}
          className="p-1.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-center"
          title="Isometric View"
        >
          ISO
        </button>
        <div className="h-px bg-slate-800 my-0.5" />
        <button
          onClick={() => snapToView('reset')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all flex items-center justify-center"
          title="Reset Camera"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      {/* ── Bottom Viewport Tools (Grid, Shadows, Auto-Rotate, Snapshot, Fullscreen) ── */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 z-10">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/80 border border-slate-800 backdrop-blur-md">
          <button
            onClick={() => onShowGridChange(!showGrid)}
            className={`p-1.5 rounded-lg text-xs transition-all ${
              showGrid ? 'bg-sky-500/20 text-sky-400' : 'text-slate-400 hover:text-white'
            }`}
            title="Toggle Ground Grid"
          >
            <Grid size={14} />
          </button>
          <button
            onClick={() => onShowShadowsChange(!showShadows)}
            className={`p-1.5 rounded-lg text-xs transition-all ${
              showShadows ? 'bg-sky-500/20 text-sky-400' : 'text-slate-400 hover:text-white'
            }`}
            title="Toggle Real-Time Shadows"
          >
            <Sun size={14} />
          </button>
          <button
            onClick={() => onAutoRotateChange(!autoRotate)}
            className={`p-1.5 rounded-lg text-xs transition-all ${
              autoRotate ? 'bg-sky-500/20 text-sky-400' : 'text-slate-400 hover:text-white'
            }`}
            title="Toggle Auto-Rotate"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={handleSnapshot}
            className="p-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            title="Take High-Resolution Snapshot"
          >
            <Camera size={14} />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            title="Toggle Fullscreen"
          >
            <Maximize2 size={14} />
          </button>
        </div>

        {/* Walkthrough Navigation Hint */}
        {cameraMode === 'walkthrough' && (
          <div className="px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-400/40 text-[10px] text-indigo-300 font-medium flex items-center gap-1.5 shadow-md">
            <Footprints size={12} className="text-indigo-400" />
            <span>WASD to walk • Q/E elevation</span>
          </div>
        )}
      </div>

      {/* ── Loading Overlay ── */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-20">
          <div className="w-8 h-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
          <span className="text-xs font-semibold text-slate-200">Loading 3D asset geometry & textures...</span>
        </div>
      )}

      {/* ── Error Banner ── */}
      {loadError && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-medium flex items-center gap-2 z-20">
          <ShieldAlert size={14} />
          <span>{loadError}</span>
        </div>
      )}
    </div>
  );
};
