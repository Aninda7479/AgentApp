/**
 * VRMViewer.tsx — Modular VRM 3D Canvas & Kinematics Renderer
 * 
 * Features:
 * 1. 125 Modular Animation Clips: Imports pure pose functions from `./animations`
 * 2. Preserved Rest Kinematics: Maintains natural humanoid hip height so model never sinks into ground
 * 3. Smooth Continuous Pose Interpolator: Seamlessly blends transitions between all actions & idle ($8.5\times$ damping)
 * 4. Dynamic Live-Joint Skeleton Auto-Framing: Accurately centers Full / Half / Face camera views for standing & sitting
 * 5. High-DPI 16x Anisotropic Textures & 4-Point Studio Lighting with ground contact shadow
 * 6. Micro-expressions: Saccadic eye gaze, natural stochastic blinking, real-time lip-sync
 * 7. Interactive Touch/Click Reactions: Raycasts touch zones on avatar (Head, Cheeks, Ears, Arms, Ribs)
 */
import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM, VRMExpressionPresetName, VRMHumanBoneName } from '@pixiv/three-vrm';
import {
  type CompanionMood,
  type CompanionAction,
  type VRMViewerHandle,
  type VRMPose,
  applyFingerPreset,
  applyMoodExpressions,
  ACTION_DURATIONS,
  getIdlePose,
  getTalkingPose,
  resolveActionPose,
} from './animations';

export type { CompanionMood, CompanionAction, VRMViewerHandle, VRMPose };

interface Props {
  vrmUrl: string;
  mood?: CompanionMood;
  action?: CompanionAction;
  angle?: 'portrait' | 'half' | 'full';
  className?: string;
  onActionEnd?: () => void;
  onAvatarInteract?: (action: CompanionAction) => void;
}

export const VRMViewer = forwardRef<VRMViewerHandle, Props>(
  ({ vrmUrl, mood = 'idle', action = 'idle', angle = 'full', className = '', onActionEnd, onAvatarInteract }, ref) => {
    const containerRef    = useRef<HTMLDivElement>(null);
    const vrmRef          = useRef<VRM | null>(null);
    const rendererRef     = useRef<THREE.WebGLRenderer | null>(null);
    const rafRef          = useRef<number | null>(null);
    const clockRef        = useRef(new THREE.Clock());
    const restHipsPosRef  = useRef<THREE.Vector3 | null>(null);

    const currentActionRef = useRef<CompanionAction>(action);
    const actionTimeRef    = useRef<number>(0);
    const currentMoodRef   = useRef<CompanionMood>(mood);
    const isLipSyncRef     = useRef<boolean>(false);
    const mousePosRef      = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const currentGazeRef   = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const propsRef = useRef({ angle, onActionEnd, onAvatarInteract });
    useEffect(() => { propsRef.current = { angle, onActionEnd, onAvatarInteract }; }, [angle, onActionEnd, onAvatarInteract]);

    useEffect(() => {
      currentActionRef.current = action;
      actionTimeRef.current = 0;
    }, [action]);

    useEffect(() => {
      currentMoodRef.current = mood;
      applyMoodExpressions(vrmRef.current, mood);
    }, [mood]);

    useImperativeHandle(ref, () => ({
      setMood: (m: CompanionMood) => {
        currentMoodRef.current = m;
        applyMoodExpressions(vrmRef.current, m);
      },
      playAction: (act: CompanionAction) => {
        currentActionRef.current = act;
        actionTimeRef.current = 0;
      },
      startLipSync: () => {
        isLipSyncRef.current = true;
      },
      stopLipSync: () => {
        isLipSyncRef.current = false;
        vrmRef.current?.expressionManager?.setValue('aa', 0);
        vrmRef.current?.expressionManager?.setValue('oh', 0);
        vrmRef.current?.expressionManager?.setValue('ih', 0);
      },
    }));

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const w = el.clientWidth || 800;
      const h = el.clientHeight || 700;

      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
      el.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();

      // Studio Lighting setup
      scene.add(new THREE.AmbientLight(0xfff8f2, 1.05));

      const keyLight = new THREE.DirectionalLight(0xfffaed, 2.3);
      keyLight.position.set(2.0, 3.5, 3.0);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.bias = -0.0001;
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xcfdfff, 1.1);
      fillLight.position.set(-2.5, 2.0, 2.5);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0xf472b6, 1.4);
      rimLight.position.set(0, 3.0, -2.5);
      scene.add(rimLight);

      const bottomGlow = new THREE.DirectionalLight(0x818cf8, 0.45);
      bottomGlow.position.set(0, -1.5, 1.5);
      scene.add(bottomGlow);

      // Soft Ground Pedestal Shadow
      const groundShadowGeo = new THREE.PlaneGeometry(2.4, 2.4);
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = 128;
      shadowCanvas.height = 128;
      const sCtx = shadowCanvas.getContext('2d');
      if (sCtx) {
        const grad = sCtx.createRadialGradient(64, 64, 10, 64, 64, 60);
        grad.addColorStop(0, 'rgba(0,0,0,0.55)');
        grad.addColorStop(0.5, 'rgba(15,23,42,0.25)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        sCtx.fillStyle = grad;
        sCtx.fillRect(0, 0, 128, 128);
      }
      const shadowTex = new THREE.CanvasTexture(shadowCanvas);
      const groundShadowMat = new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
      });
      const groundShadow = new THREE.Mesh(groundShadowGeo, groundShadowMat);
      groundShadow.rotation.x = -Math.PI / 2;
      groundShadow.position.y = 0.001;
      scene.add(groundShadow);

      const camera = new THREE.PerspectiveCamera(30, w / h, 0.01, 50);
      camera.position.set(0, 0.8, 2.65);
      const lookAt = new THREE.Vector3(0, 0.75, 0);
      camera.lookAt(lookAt);

      const handleMouseMove = (e: MouseEvent) => {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        mousePosRef.current = { x: nx, y: ny };
      };
      window.addEventListener('mousemove', handleMouseMove);

      // ── Interactive Click/Touch Raycasting on Avatar ─────────────────────────
      const raycaster = new THREE.Raycaster();
      const mouseVec = new THREE.Vector2();

      const handleClick = (e: MouseEvent) => {
        if (!vrmRef.current) return;
        const rect = el.getBoundingClientRect();
        mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseVec.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

        raycaster.setFromCamera(mouseVec, camera);
        const hits = raycaster.intersectObjects(vrmRef.current.scene.children, true);

        if (hits.length > 0) {
          const hitPt = hits[0].point;
          let interactAction: CompanionAction = 'react_tap_surprise';

          if (hitPt.y > 1.45) {
            // Top of head
            interactAction = 'react_headpat';
          } else if (hitPt.y > 1.25) {
            // Face level
            if (Math.abs(hitPt.x) > 0.12) {
              interactAction = 'react_ear_pull';
            } else if (Math.abs(hitPt.x) > 0.04) {
              interactAction = 'react_poke';
            } else {
              interactAction = 'react_boop';
            }
          } else if (hitPt.y > 0.85) {
            // Torso & Arms
            if (Math.abs(hitPt.x) > 0.2) {
              interactAction = 'react_arm_touch';
            } else {
              interactAction = 'react_tickle';
            }
          } else {
            interactAction = 'react_tap_surprise';
          }

          currentActionRef.current = interactAction;
          actionTimeRef.current = 0;
          propsRef.current.onAvatarInteract?.(interactAction);
        }
      };
      el.addEventListener('click', handleClick);

      const getBone = (vrm: VRM, name: VRMHumanBoneName) => {
        return vrm.humanoid?.getNormalizedBoneNode(name) || null;
      };

      const loader = new GLTFLoader();
      loader.register(p => new VRMLoaderPlugin(p));
      loader.load(
        vrmUrl,
        gltf => {
          const vrm: VRM = gltf.userData.vrm;
          VRMUtils.rotateVRM0(vrm);

          vrm.scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(vrm.scene);
          
          const bottomOffset = box.min.y;
          vrm.scene.position.y = -bottomOffset;
          vrm.scene.updateMatrixWorld(true);

          const hipsNode = getBone(vrm, 'hips');
          if (hipsNode) {
            restHipsPosRef.current = hipsNode.position.clone();
          }

          const maxAniso = renderer.capabilities.getMaxAnisotropy();
          vrm.scene.traverse((obj: any) => {
            if (obj.isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
              if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach(m => {
                  if (m.map) {
                    m.map.anisotropy = maxAniso;
                    m.map.minFilter = THREE.LinearMipmapLinearFilter;
                    m.map.magFilter = THREE.LinearFilter;
                    m.map.generateMipmaps = true;
                    m.map.needsUpdate = true;
                  }
                });
              }
            }
          });

          scene.add(vrm.scene);
          vrmRef.current = vrm;
          applyMoodExpressions(vrm, currentMoodRef.current);
        },
        undefined,
        err => console.error('[VRMViewer] VRM load error:', err)
      );

      let blinkTimer = 0;
      let blinkInterval = 2.5 + Math.random() * 3;
      let blinkState: 'open' | 'closing' | 'opening' = 'open';
      let saccadeTimer = 0;
      let saccadeOffset = { x: 0, y: 0 };
      let lipSyncPhase = 0;

      // ── Main Animation Execution Loop ───────────────────────────────────────
      const animate = () => {
        rafRef.current = requestAnimationFrame(animate);
        const dt = Math.min(clockRef.current.getDelta(), 0.1);
        const t = clockRef.current.elapsedTime;
        actionTimeRef.current += dt;
        const actTime = actionTimeRef.current;
        const act = currentActionRef.current;
        const mood = currentMoodRef.current;

        const vrm = vrmRef.current;
        if (vrm) {
          // Gaze Tracking with Natural Saccades
          saccadeTimer += dt;
          if (saccadeTimer > 2.0 + Math.random() * 2.5) {
            saccadeTimer = 0;
            saccadeOffset = {
              x: (Math.random() - 0.5) * 0.10,
              y: (Math.random() - 0.5) * 0.06,
            };
          }
          const targetGazeX = THREE.MathUtils.clamp(mousePosRef.current.x * 0.35 + saccadeOffset.x, -0.35, 0.35);
          const targetGazeY = THREE.MathUtils.clamp(mousePosRef.current.y * 0.25 + saccadeOffset.y, -0.25, 0.25);
          currentGazeRef.current.x = THREE.MathUtils.lerp(currentGazeRef.current.x, targetGazeX, dt * 5.0);
          currentGazeRef.current.y = THREE.MathUtils.lerp(currentGazeRef.current.y, targetGazeY, dt * 5.0);

          // 1. Calculate Base Standing Idle Pose
          const idlePose = getIdlePose(t, currentGazeRef.current.x, currentGazeRef.current.y);

          // 2. Select Active Isolated Action Pose among 125 library actions
          let activePose: VRMPose = idlePose;
          const maxDur = ACTION_DURATIONS[act];
          if (maxDur && actTime > maxDur) {
            currentActionRef.current = 'idle';
            propsRef.current.onActionEnd?.();
          }

          if (isLipSyncRef.current && act === 'idle') {
            activePose = getTalkingPose(t, idlePose);
          } else {
            activePose = resolveActionPose(act, t, actTime, idlePose);
          }

          // 3. Smooth Continuous Bone Interpolator (Damping Slerp/Lerp at 8.5x)
          const blendRate = THREE.MathUtils.clamp(dt * 8.5, 0, 1);

          const applySmoothRot = (boneName: VRMHumanBoneName, rot?: [number, number, number]) => {
            if (!rot) return;
            const bone = getBone(vrm, boneName);
            if (bone) {
              bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, rot[0], blendRate);
              bone.rotation.y = THREE.MathUtils.lerp(bone.rotation.y, rot[1], blendRate);
              bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, rot[2], blendRate);
            }
          };

          // Maintain rest hips position + relative animation offset
          const hips = getBone(vrm, 'hips');
          if (hips && restHipsPosRef.current) {
            const rest = restHipsPosRef.current;
            const targetX = rest.x + (activePose.hipsPos ? activePose.hipsPos[0] : 0);
            const targetY = rest.y + (activePose.hipsPos ? activePose.hipsPos[1] : 0);
            const targetZ = rest.z + (activePose.hipsPos ? activePose.hipsPos[2] : 0);
            hips.position.x = THREE.MathUtils.lerp(hips.position.x, targetX, blendRate);
            hips.position.y = THREE.MathUtils.lerp(hips.position.y, targetY, blendRate);
            hips.position.z = THREE.MathUtils.lerp(hips.position.z, targetZ, blendRate);
          }

          applySmoothRot('hips', activePose.hipsRot);
          applySmoothRot('spine', activePose.spineRot);
          applySmoothRot('chest', activePose.chestRot);
          applySmoothRot('upperChest', activePose.upperChestRot);
          applySmoothRot('neck', activePose.neckRot);
          applySmoothRot('head', activePose.headRot);

          applySmoothRot('leftShoulder', activePose.leftShoulderRot);
          applySmoothRot('leftUpperArm', activePose.leftUpperArmRot);
          applySmoothRot('leftLowerArm', activePose.leftLowerArmRot);
          applySmoothRot('leftHand', activePose.leftHandRot);

          applySmoothRot('rightShoulder', activePose.rightShoulderRot);
          applySmoothRot('rightUpperArm', activePose.rightUpperArmRot);
          applySmoothRot('rightLowerArm', activePose.rightLowerArmRot);
          applySmoothRot('rightHand', activePose.rightHandRot);

          // Apply Lower Limbs (Legs, Knees, Feet)
          applySmoothRot('leftUpperLeg', activePose.leftUpperLegRot);
          applySmoothRot('rightUpperLeg', activePose.rightUpperLegRot);
          applySmoothRot('leftLowerLeg', activePose.leftLowerLegRot);
          applySmoothRot('rightLowerLeg', activePose.rightLowerLegRot);
          applySmoothRot('leftFoot', activePose.leftFootRot);
          applySmoothRot('rightFoot', activePose.rightFootRot);

          // Apply finger presets with correct anatomical kinematics
          applyFingerPreset(vrm, 'left', activePose.leftFingers || 'relaxed');
          applyFingerPreset(vrm, 'right', activePose.rightFingers || 'relaxed');

          // Apply action expressions if present
          if (activePose.expressions && vrm.expressionManager) {
            for (const [k, v] of Object.entries(activePose.expressions)) {
              vrm.expressionManager.setValue(k as VRMExpressionPresetName, v);
            }
          }

          // Natural Stochastic Blinking
          blinkTimer += dt;
          if (blinkState === 'open' && blinkTimer >= blinkInterval) {
            blinkState = 'closing';
            blinkTimer = 0;
          } else if (blinkState === 'closing') {
            const v = Math.min(blinkTimer / 0.07, 1);
            vrm.expressionManager?.setValue('blink', v);
            if (v >= 1) { blinkState = 'opening'; blinkTimer = 0; }
          } else if (blinkState === 'opening') {
            const v = Math.max(1 - blinkTimer / 0.09, 0);
            vrm.expressionManager?.setValue('blink', v);
            if (v <= 0) {
              blinkState = 'open';
              blinkTimer = 0;
              blinkInterval = 2.2 + Math.random() * 3.5;
            }
          }

          // Lip-Sync Visemes
          if (isLipSyncRef.current) {
            lipSyncPhase += dt * 14.0;
            const mouthA = Math.max(0, Math.sin(lipSyncPhase) * 0.75);
            const mouthO = Math.max(0, Math.cos(lipSyncPhase * 0.7) * 0.45);
            vrm.expressionManager?.setValue('aa', mouthA);
            vrm.expressionManager?.setValue('oh', mouthO);
          }

          vrm.update(dt);
        }

        // Live Joint Auto-Framing with Seated / Floor Compensation
        const headNode = vrm ? getBone(vrm, 'head') : null;
        const hipsNode = vrm ? getBone(vrm, 'hips') : null;
        const headPos = new THREE.Vector3();
        const hipsPos = new THREE.Vector3();

        if (headNode) headNode.getWorldPosition(headPos);
        if (hipsNode) hipsNode.getWorldPosition(hipsPos);

        const headY = headPos.y || 1.48;
        const hipsY = hipsPos.y || 0.82;
        const torsoY = (headY + hipsY) / 2;
        const fullHeight = headY + 0.22;
        const bodyCenterY = Math.max(0.4, fullHeight * 0.5);

        const currentAngle = propsRef.current.angle || 'full';

        let targetLookY = bodyCenterY;
        let targetCamY  = bodyCenterY + 0.05;
        let targetDist  = 3.45;
        let targetFov   = 32;

        if (currentAngle === 'portrait') {
          targetLookY = headY;
          targetCamY  = headY;
          targetDist  = 1.15;
          targetFov   = 26;
        } else if (currentAngle === 'half') {
          targetLookY = torsoY + 0.05;
          targetCamY  = torsoY + 0.05;
          targetDist  = 2.15;
          targetFov   = 28;
        } else {
          targetLookY = bodyCenterY;
          targetCamY  = bodyCenterY + 0.05;
          targetDist  = 3.45;
          targetFov   = 32;
        }

        const targetPos = new THREE.Vector3(0, targetCamY, targetDist);
        const targetLook = new THREE.Vector3(0, targetLookY, 0);

        camera.position.lerp(targetPos, dt * 5.0);
        lookAt.lerp(targetLook, dt * 5.0);
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 5.0);
        camera.updateProjectionMatrix();
        camera.lookAt(lookAt);

        renderer.render(scene, camera);
      };

      clockRef.current.start();
      rafRef.current = requestAnimationFrame(animate);

      const ro = new ResizeObserver(() => {
        const nw = el.clientWidth;
        const nh = el.clientHeight;
        if (nw > 0 && nh > 0) {
          renderer.setSize(nw, nh, false);
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
        }
      });
      ro.observe(el);

      return () => {
        ro.disconnect();
        window.removeEventListener('mousemove', handleMouseMove);
        el.removeEventListener('click', handleClick);
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        if (vrmRef.current) {
          VRMUtils.deepDispose(vrmRef.current.scene);
          vrmRef.current = null;
        }
        renderer.dispose();
        rendererRef.current = null;
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vrmUrl]);

    return (
      <div
        ref={containerRef}
        className={`w-full h-full relative overflow-hidden cursor-pointer ${className}`}
        style={{ background: 'transparent' }}
        aria-label="3D AI Companion Avatar"
      />
    );
  }
);

VRMViewer.displayName = 'VRMViewer';
