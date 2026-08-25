/**
 * VRMViewer.tsx — Three.js + @pixiv/three-vrm companion viewer.
 * Loads the VRM, idles (breathing, blink, head sway), exposes
 * setMood / startLipSync / stopLipSync via forwardRef.
 */
import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM, VRMExpressionPresetName } from '@pixiv/three-vrm';

export type CompanionMood = 'idle' | 'thinking' | 'working' | 'celebrate' | 'happy' | 'sad' | 'angry' | 'surprised';

const MOOD_EXPRESSION: Partial<Record<CompanionMood, VRMExpressionPresetName>> = {
  thinking:  'neutral',
  working:   'neutral',
  celebrate: 'happy',
  happy:     'happy',
  sad:       'sad',
  angry:     'angry',
  surprised: 'surprised',
};

const CAMERA_PRESETS = {
  portrait: { pos: [0, 1.42, 1.8]  as [number,number,number], look: [0, 1.36, 0] as [number,number,number] },
  half:     { pos: [0, 1.0,  2.8]  as [number,number,number], look: [0, 0.9,  0] as [number,number,number] },
  full:     { pos: [0, 0.7,  4.2]  as [number,number,number], look: [0, 0.6,  0] as [number,number,number] },
};

export interface VRMViewerHandle {
  setMood: (mood: CompanionMood) => void;
  startLipSync: () => void;
  stopLipSync:  () => void;
}

interface Props {
  vrmUrl:    string;
  mood?:     CompanionMood;
  angle?:    keyof typeof CAMERA_PRESETS;
  className?: string;
}

export const VRMViewer = forwardRef<VRMViewerHandle, Props>(
  ({ vrmUrl, mood = 'idle', angle = 'half', className = '' }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const vrmRef       = useRef<VRM | null>(null);
    const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
    const rafRef       = useRef<number | null>(null);
    const clockRef     = useRef(new THREE.Clock());
    const propsRef     = useRef({ mood, angle });
    useEffect(() => { propsRef.current = { mood, angle }; }, [mood, angle]);

    useImperativeHandle(ref, () => ({
      setMood: (m: CompanionMood) => {
        const vrm = vrmRef.current;
        if (!vrm?.expressionManager) return;
        for (const k of Object.values(MOOD_EXPRESSION)) vrm.expressionManager.setValue(k!, 0);
        const preset = MOOD_EXPRESSION[m];
        if (preset) vrm.expressionManager.setValue(preset, 0.9);
      },
      startLipSync: () => vrmRef.current?.expressionManager?.setValue('aa', 0.6),
      stopLipSync:  () => {
        vrmRef.current?.expressionManager?.setValue('aa', 0);
        vrmRef.current?.expressionManager?.setValue('oh', 0);
      },
    }));

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const w = el.clientWidth || 480;
      const h = el.clientHeight || 600;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.shadowMap.enabled = true;
      renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
      el.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const key = new THREE.DirectionalLight(0xfff5e8, 1.8);
      key.position.set(2, 4, 3); key.castShadow = true; scene.add(key);
      const rim = new THREE.DirectionalLight(0xaabbff, 0.6);
      rim.position.set(-2, 2, -1); scene.add(rim);
      const fill = new THREE.DirectionalLight(0xffd9ec, 0.35);
      fill.position.set(0, -1, 3); scene.add(fill);

      const preset0 = CAMERA_PRESETS[propsRef.current.angle] || CAMERA_PRESETS.half;
      const camera  = new THREE.PerspectiveCamera(38, w / h, 0.01, 50);
      camera.position.set(...preset0.pos);
      const lookAt = new THREE.Vector3(...preset0.look);
      camera.lookAt(lookAt);

      const loader = new GLTFLoader();
      loader.register(p => new VRMLoaderPlugin(p));
      loader.load(vrmUrl, gltf => {
        const vrm: VRM = gltf.userData.vrm;
        VRMUtils.rotateVRM0(vrm);
        scene.add(vrm.scene);
        vrmRef.current = vrm;
        const im = MOOD_EXPRESSION[propsRef.current.mood];
        if (im) vrm.expressionManager?.setValue(im, 0.8);
      }, undefined, e => console.error('[VRMViewer]', e));

      let blinkTimer = 0, blinkInterval = 3 + Math.random() * 3;
      type BS = 'open'|'closing'|'opening';
      let blinkState: BS = 'open';

      const animate = () => {
        rafRef.current = requestAnimationFrame(animate);
        const dt = clockRef.current.getDelta();
        const t  = clockRef.current.elapsedTime;
        const vrm = vrmRef.current;
        if (vrm) {
          vrm.humanoid?.getNormalizedBoneNode('spine')?.rotation && (
            vrm.humanoid.getNormalizedBoneNode('spine')!.rotation.x = Math.sin(t * 0.4) * 0.012
          );
          const hd = vrm.humanoid?.getNormalizedBoneNode('head');
          if (hd) { hd.rotation.y = Math.sin(t * 0.25) * 0.04; hd.rotation.z = Math.sin(t * 0.18) * 0.015; }

          blinkTimer += dt;
          if (blinkState === 'open' && blinkTimer >= blinkInterval) { blinkState = 'closing'; blinkTimer = 0; }
          else if (blinkState === 'closing') {
            const v = Math.min(blinkTimer / 0.08, 1);
            vrm.expressionManager?.setValue('blink', v);
            if (v >= 1) { blinkState = 'opening'; blinkTimer = 0; }
          } else if (blinkState === 'opening') {
            const v = Math.max(1 - blinkTimer / 0.1, 0);
            vrm.expressionManager?.setValue('blink', v);
            if (v <= 0) { blinkState = 'open'; blinkTimer = 0; blinkInterval = 3 + Math.random() * 4; }
          }
          vrm.update(dt);
        }
        const tp = CAMERA_PRESETS[propsRef.current.angle] || CAMERA_PRESETS.half;
        camera.position.lerp(new THREE.Vector3(...tp.pos), 0.06);
        lookAt.lerp(new THREE.Vector3(...tp.look), 0.06);
        camera.lookAt(lookAt);
        renderer.render(scene, camera);
      };
      clockRef.current.start();
      rafRef.current = requestAnimationFrame(animate);

      const ro = new ResizeObserver(() => {
        const nw = el.clientWidth, nh = el.clientHeight;
        renderer.setSize(nw, nh, false);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
      });
      ro.observe(el);

      return () => {
        ro.disconnect();
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        if (vrmRef.current) { VRMUtils.deepDispose(vrmRef.current.scene); vrmRef.current = null; }
        renderer.dispose(); rendererRef.current = null;
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vrmUrl]);

    return <div ref={containerRef} className={`relative overflow-hidden ${className}`} style={{ background: 'transparent' }} />;
  }
);
VRMViewer.displayName = 'VRMViewer';
