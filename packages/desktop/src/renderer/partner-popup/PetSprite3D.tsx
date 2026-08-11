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
}

/**
 * Renders the Lily 3D procedural model (Three.js) inside a small canvas that
 * lives inside the PartnerOverlay card.
 *
 * Reuses the exact Lily class that powers the full-screen desktop pet — the
 * same geometry, joints, animations, face details, laptop screen, and
 * behavior state machine — scaled down and capped at 24 FPS for efficiency.
 */
export const PetSprite3D: React.FC<PetSprite3DProps> = ({
  manifest,
  mood,
  size = 160,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const lilyRef      = useRef<InstanceType<typeof Lily> | null>(null);
  const rafRef       = useRef<number | null>(null);
  const prevTimeRef  = useRef<number | null>(null);
  const moodRef      = useRef<PartnerMood>(mood);

  // Sync mood to the live Lily instance without remounting the scene.
  useEffect(() => {
    moodRef.current = mood;
    if (lilyRef.current) {
      lilyRef.current.setBehavior(behaviorFor(mood));
    }
  }, [mood]);

  // Mount the Three.js scene once on first render.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Canvas + Renderer ────────────────────────────────────────────────────
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.style.cssText = `width:${size}px;height:${size}px;display:block;border-radius:inherit;`;
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

    // ── Camera — frames Lily from knee-level up, focusing on face+torso ──────
    // FOV 38° with aspect 1:1 at z=3.8 puts the full seated figure in frame.
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(0, 0.55, 3.8);
    camera.lookAt(0, 0.35, 0);

    // ── Lighting (3 lights, no env map — fast for small canvas) ─────────────
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

    // Rim light — classic anime character lighting from upper-left
    const rim = new THREE.DirectionalLight(0xaabbff, 0.55);
    rim.position.set(-2, 2, -1);
    scene.add(rim);

    // Warm fill from front-below simulating laptop screen glow
    const fill = new THREE.DirectionalLight(0xffd9ec, 0.28);
    fill.position.set(0, -1, 3);
    scene.add(fill);

    // Soft contact shadow grounding the character
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
      lily.setBehavior(behaviorFor(moodRef.current));
      scene.add(lily.object);
      lilyRef.current = lily;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[PetSprite3D] Failed to build Lily model:', err);
    }

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

      if (lily) {
        lily.update(dt, timestamp / 1000);
      }
      renderer.render(scene, camera);
    };

    rafRef.current = requestAnimationFrame(animate);

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
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
      // Remove the canvas from the DOM
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      prevTimeRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs only once — mood synced via the effect above

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{ width: size, height: size }}
      aria-label={`${manifest.name} 3D companion`}
    />
  );
};
