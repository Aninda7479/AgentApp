import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Lily } from '@lily-model';
import type { PartnerManifest, PartnerMood } from './types';

type Behavior = 'working' | 'idle' | 'sleeping' | 'laying' | 'walk' | 'poke' | 'celebrate' | 'talking' | 'sad' | 'hello';

/** Map overlay PartnerMood to the Lily behavior state machine. */
function behaviorFor(mood: PartnerMood): Behavior {
  switch (mood) {
    case 'working':   return 'working';
    case 'thinking':  return 'idle';      // idle pose + gentle head movement
    case 'celebrate': return 'celebrate';
    case 'sad':       return 'sad';
    case 'sleeping':  return 'sleeping';
    case 'happy':     return 'celebrate';
    case 'idle':
    default:          return 'idle';
  }
}

export interface PetSprite3DProps {
  manifest: PartnerManifest;
  mood: PartnerMood;
  /** CSS pixel size of the canvas square. Default 160. */
  size?: number;
  className?: string;
  /** Camera framing level */
  cameraAngle?: 'close-up' | 'normal' | 'full';
  /** Toggle real-time talking mouth animation */
  lipSync?: boolean;
  /** Toggle tired/angry visual style */
  darkCircles?: boolean;
  /** Callback fired when a specific body/hair/accessory part is clicked */
  onPoke?: (part: string) => void;
}

// Camera presets for smooth lerping
const CAMERA_PRESETS = {
  'close-up': {
    pos: new THREE.Vector3(0, 0.72, 2.0),
    look: new THREE.Vector3(0, 0.65, 0)
  },
  'normal': {
    pos: new THREE.Vector3(0, 0.55, 3.8),
    look: new THREE.Vector3(0, 0.35, 0)
  },
  'full': {
    pos: new THREE.Vector3(0, 0.25, 5.0),
    look: new THREE.Vector3(0, 0.15, 0)
  }
};

/**
 * Renders the Lily 3D procedural model (Three.js) inside a small canvas.
 * Supports smooth camera transitions, raycasting pokes, expressions, and sound feedback.
 */
export const PetSprite3D: React.FC<PetSprite3DProps> = ({
  manifest,
  mood,
  size = 160,
  className = '',
  cameraAngle = 'normal',
  lipSync = false,
  darkCircles = false,
  onPoke
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const lilyRef      = useRef<InstanceType<typeof Lily> | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const rafRef       = useRef<number | null>(null);
  const prevTimeRef  = useRef<number | null>(null);

  // Sync props to refs to avoid re-mounting
  const propsRef = useRef({ mood, lipSync, darkCircles, cameraAngle, onPoke });
  useEffect(() => {
    propsRef.current = { mood, lipSync, darkCircles, cameraAngle, onPoke };
    if (lilyRef.current) {
      lilyRef.current.setBehavior(behaviorFor(mood));
      lilyRef.current.setLipSync(lipSync);
      lilyRef.current.setDarkCircles(darkCircles);
    }
  }, [mood, lipSync, darkCircles, cameraAngle, onPoke]);

  // Mount the Three.js scene once on first render.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Canvas + Renderer ────────────────────────────────────────────────────
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.style.cssText = `width:${size}px;height:${size}px;display:block;border-radius:inherit;cursor:pointer;`;
    container.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power'
    });
    renderer.setPixelRatio(dpr);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // ── Scene ────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();

    // ── Camera ───────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    const initialPreset = CAMERA_PRESETS[propsRef.current.cameraAngle] || CAMERA_PRESETS.normal;
    camera.position.copy(initialPreset.pos);
    const currentLookAt = initialPreset.look.clone();
    cameraRef.current = camera;

    // ── Lighting ─────────────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -2;
    key.shadow.camera.right = 2;
    key.shadow.camera.top = 2;
    key.shadow.camera.bottom = -2;
    key.shadow.bias = -0.0004;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xaabbff, 0.55);
    rim.position.set(-2, 2, -1);
    scene.add(rim);

    const fill = new THREE.DirectionalLight(0xffd9ec, 0.28);
    fill.position.set(0, -1, 3);
    scene.add(fill);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.ShadowMaterial({ opacity: 0.22 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.receiveShadow = true;
    shadow.position.y = -1.1;
    scene.add(shadow);

    // ── Lily 3D model ────────────────────────────────────────────────────────
    let lily: InstanceType<typeof Lily> | null = null;
    try {
      lily = new Lily(manifest.accent || '#ff8fb3');
      lily.setBehavior(behaviorFor(propsRef.current.mood));
      lily.setLipSync(propsRef.current.lipSync);
      lily.setDarkCircles(propsRef.current.darkCircles);
      scene.add(lily.object);
      lilyRef.current = lily;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[PetSprite3D] Failed to build Lily model:', err);
    }

    // ── Click to Poke / Raycasting ───────────────────────────────────────────
    const handleClick = (e: MouseEvent) => {
      if (!lily || !cameraRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      const part = lily.raycastPart(new THREE.Vector2(x, y), cameraRef.current);
      if (part) {
        lily.setBehavior('poke', { part });
        
        // Audio synthesis for click feedback
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            lily.playSound(520, ctx);
          }
        } catch (_) { /* ignore audio permission failures */ }

        // Callback trigger
        if (propsRef.current.onPoke) {
          propsRef.current.onPoke(part);
        }
      }
    };
    canvas.addEventListener('click', handleClick);

    // ── Animation loop — capped at 24 FPS ───────────────────────────────────
    const FPS_CAP_MS = 1000 / 24;
    let lastFrameTs = 0;

    const animate = (timestamp: number) => {
      rafRef.current = requestAnimationFrame(animate);

      if (timestamp - lastFrameTs < FPS_CAP_MS) return;
      const dt = prevTimeRef.current !== null
        ? Math.min((timestamp - prevTimeRef.current) / 1000, 0.1)
        : 0.016;
      prevTimeRef.current = timestamp;
      lastFrameTs = timestamp;

      // Camera Angle smooth interpolation (Lerp)
      const targetPreset = CAMERA_PRESETS[propsRef.current.cameraAngle] || CAMERA_PRESETS.normal;
      camera.position.lerp(targetPreset.pos, 0.1);
      currentLookAt.lerp(targetPreset.look, 0.1);
      camera.lookAt(currentLookAt);

      if (lily) {
        lily.update(dt, timestamp / 1000);
      }
      renderer.render(scene, camera);
    };

    rafRef.current = requestAnimationFrame(animate);

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      canvas.removeEventListener('click', handleClick);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (lily) {
        try { lily.dispose(); } catch (_) { /* ignore */ }
        lilyRef.current = null;
      }
      renderer.dispose();
      rendererRef.current = null;
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      prevTimeRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{ width: size, height: size }}
      aria-label={`${manifest.name} 3D companion`}
    />
  );
};
