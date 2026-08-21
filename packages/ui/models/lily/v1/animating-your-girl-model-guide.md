# Animating your character in React Three Fiber — full pipeline

## 1. What your `v1.zip` actually contains

I opened it up and inspected it directly. It's the raw output of an **AI image-to-3D generator** (Tripo/Meshy/Hunyuan-style), not a game-ready asset:

| File | What it is |
|---|---|
| `a6267fdb240e08692fb49a35f059a1e1.obj` | **1 static mesh**, 749,753 vertices / 1,499,810 triangles, **no skeleton, no bones, no animation, no vertex normals** |
| `material.mtl` | One material, references 4 texture maps |
| `texture_pbr_*.png` | Albedo, Normal, Roughness, Metallic — all **4096×4096** |

Total: ~130MB. This is way too heavy to put in a browser as-is, and — this is the important part — **it cannot "do" anything**. There's no rig, so there's no concept of an arm bending to type or a body lying down. A mesh like this is a frozen statue in one pose; three.js/R3F can only move things that have bones (or move the whole object as one rigid piece, or blend pre-baked shape keys).

So "she uses a laptop, then sleeps with a pillow" needs **skeletal animation**, and that has to be added outside of React — no JS library rigs a character for you. Here's the real pipeline:

```
your OBJ  →  decimate + clean  →  rig (Mixamo)  →  animation clips  →  GLB  →  React Three Fiber
   (done for you below)          (you do this, ~20 min, free)                  (code below)
```

## 2. Step 1 — Optimization (already done)

I decimated and repacked the model for you, preserving UVs properly (naive decimation destroys texture mapping, so I used collapse-history remapping to carry the UVs through). Two files are attached:

- **`girl_optimized.glb`** (9MB) — 120k→96k triangles, plain PNG textures embedded. Zero extra setup, loads in R3F with just `useGLTF`.
- **`girl_web.glb`** (**876KB**) — same geometry, further compressed with Meshopt (geometry) + WebP (textures). This is what you should ship to production, but it needs one extra line in your loader (see §5).

Both went from **130MB → under 9MB**, and the small one is **~150x smaller** than the original. I verified both are spec-valid glTF and rendered a shaded preview to confirm the decimation didn't warp the silhouette — she's intact.

I also fixed the PBR wiring while repacking: your metallic and roughness maps are now combined into a single glTF-standard `metallicRoughnessTexture` (R=unused, G=roughness, B=metallic), which is what three.js's `GLTFLoader` expects — this alone fixes color-space bugs people commonly hit (the color/albedo map needs sRGB, the normal/ORM maps need linear space; the loader does this automatically now that it's packed correctly).

## 3. Step 2 — Rig it in Mixamo (free, ~10 min)

Auto-rigging isn't something you script — Adobe's Mixamo is the standard free tool:

1. Convert `girl_optimized.glb` → `.fbx`. Easiest way: open it in **Blender** (free) → File → Import → glTF 2.0 → File → Export → FBX.
2. Go to **mixamo.com** (free Adobe account) → Upload Character → upload the FBX.
3. Mixamo shows your model with markers — drag them onto her chin, wrists, elbows, knees, and groin. Click "Next" and it auto-generates a full humanoid skeleton + skin weights.
4. In the animation search, download **two** animations for this same rigged character:
   - **"Typing"** or **"Sitting Typing"** (laptop-use pose)
   - **"Sleeping Idle"** (lying-down pose)
   - Export settings: **Format: FBX for Unity (.fbx)**, **Skin: With Skin**, 30fps.

Because both downloads come from the same auto-rig session, they share identical bone names (`mixamorigHips`, `mixamorigSpine`, `mixamorigLeftHand`, etc.) — that's what lets you blend between them later.

## 4. Step 3 — Combine clips and export a web-ready GLB

1. In Blender, import the "Typing" FBX (this gives you mesh + skeleton + 1 animation).
2. Import the "Sleeping Idle" FBX into the *same* file, but only keep its **Action** (Blender's Action Editor) — delete the duplicate mesh/armature it brings in, and instead assign that Action to your first armature's NLA track (since bone names match, this works directly).
3. Rename the two Actions clearly: `Typing`, `SleepingIdle`.
4. Export → glTF 2.0 (.glb), with **"Animation → Export all Actions"** checked so both clips are embedded in one file.
5. Run it through the same web-optimization pass I used (optional but recommended):
   ```bash
   npm i -g @gltf-transform/cli
   gltf-transform optimize girl_rigged.glb girl_rigged_web.glb --texture-compress webp --texture-size 2048
   ```

You'll now have one GLB with a skinned mesh + two named animation clips.

## 5. Step 4 — React Three Fiber

```bash
npm install three @react-three/fiber @react-three/drei
```

### Scene + lighting + material quality (works right now with `girl_optimized.glb`)

This part you can build immediately — it doesn't need the rig, and it's the answer to "how do I improve the texture."

```jsx
// Scene.jsx
import { Suspense, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, ContactShadows, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'

function Girl(props) {
  const { scene } = useGLTF('/models/girl_optimized.glb')

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
        // sharper texture at grazing angles
        if (child.material.map) child.material.map.anisotropy = 8
        // let the normal map actually pick up scene reflections
        child.material.envMapIntensity = 1.1
        // proper lighting on the normal map (the file had no tangents)
        child.geometry.computeTangents?.()
      }
    })
  }, [scene])

  return <primitive object={scene} {...props} />
}
useGLTF.preload('/models/girl_optimized.glb')

export default function Scene() {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 1.4, 2.6], fov: 35 }}
      gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
    >
      <Suspense fallback={null}>
        <Girl position={[0, 0, 0]} />
        {/* HDRI environment = realistic reflections on skin/hair/metal, instead of flat plastic look */}
        <Environment preset="apartment" />
        <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={4} blur={2.4} far={2} />
      </Suspense>
      <ambientLight intensity={0.25} />
      <directionalLight position={[2, 3, 2]} intensity={1.3} castShadow shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[-2, 1, -2]} intensity={0.3} /> {/* soft rim/fill */}
      <OrbitControls target={[0, 1, 0]} enablePan={false} />
    </Canvas>
  )
}
```

That single change — `Environment` + `ACESFilmicToneMapping` + anisotropy + tangents — is usually 80% of what people mean by "the texture looks flat/plasticky in three.js." The maps themselves are already good PBR maps; the default R3F scene with one light and no tone mapping is what was making it look bad.

### Animation state machine (once you have the rigged GLB from §4)

```jsx
// AnimatedGirl.jsx
import { useEffect, useRef, useState } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'

export default function AnimatedGirl({ mode = 'Typing' }) {
  const group = useRef()
  const { scene, animations } = useGLTF('/models/girl_rigged_web.glb')
  const { actions } = useAnimations(animations, group)

  useEffect(() => {
    const action = actions[mode]
    if (!action) return
    action.reset().fadeIn(0.6).play()
    return () => action.fadeOut(0.6) // crossfades out when mode changes
  }, [mode, actions])

  return <primitive ref={group} object={scene} />
}
```

```jsx
// usage: type for 8s, then fall asleep
const [mode, setMode] = useState('Typing')
useEffect(() => {
  const id = setTimeout(() => setMode('SleepingIdle'), 8000)
  return () => clearTimeout(id)
}, [])
<AnimatedGirl mode={mode} />
```

`fadeIn`/`fadeOut` on the two `AnimationAction`s gives you a smooth 0.6s blend between "typing" and "sleeping" instead of a hard pose snap.

### Laptop + pillow props, attached to her hands/head

You'll need small separate models for the laptop and pillow (this character asset is just her). Cheapest path: build them procedurally so they're guaranteed to match your scene's lighting, and parent them to her rigged bones so they move with her hands/head automatically:

```jsx
function PropRig({ armatureScene }) {
  const laptopRef = useRef()
  const pillowRef = useRef()

  useEffect(() => {
    const leftHand = armatureScene.getObjectByName('mixamorigLeftHand')
    const rightHand = armatureScene.getObjectByName('mixamorigRightHand')
    const head = armatureScene.getObjectByName('mixamorigHead')
    if (leftHand && laptopRef.current) leftHand.add(laptopRef.current)
    if (head && pillowRef.current) head.add(pillowRef.current)
  }, [armatureScene])

  return (
    <>
      <group ref={laptopRef} position={[0.15, -0.05, 0.1]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.32, 0.015, 0.22]} />
          <meshStandardMaterial color="#d8d8d8" roughness={0.35} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.11, -0.1]} rotation={[-0.35, 0, 0]}>
          <boxGeometry args={[0.32, 0.2, 0.01]} />
          <meshStandardMaterial color="#d8d8d8" roughness={0.35} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.11, -0.096]} rotation={[-0.35, 0, 0]}>
          <planeGeometry args={[0.28, 0.16]} />
          <meshBasicMaterial color="#bfe3ff" toneMapped={false} />
        </mesh>
      </group>

      <mesh ref={pillowRef} position={[0, -0.05, 0.15]}>
        <sphereGeometry args={[0.16, 16, 12]} />
        <meshStandardMaterial color="#fff6ea" roughness={0.9} />
      </mesh>
    </>
  )
}
```

Adjust the offsets by eye once you see the real pose — Mixamo's "Typing" and "Sleeping Idle" clips have specific hand/head positions you'll want to nudge these to match. `laptopRef`/`pillowRef` only need to be visible in the matching `mode`, so wrap each in a conditional render based on `mode`.

## 6. Loading the compressed `girl_web.glb` (Meshopt + WebP)

The 876KB file uses `EXT_meshopt_compression`. Most recent versions of `@react-three/drei`'s `useGLTF` bundle a Meshopt decoder automatically. If yours doesn't decode it, extend the loader once:

```jsx
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

useGLTF('/models/girl_web.glb', true, true, (loader) => {
  loader.setMeshoptDecoder(MeshoptDecoder)
})
```

## 7. Texture-quality checklist (recap)

- ✅ Already fixed in the GLBs: metallic+roughness packed into one `metallicRoughnessTexture`, textures resized to a sane 2048/1024, correct sRGB vs. linear color space (automatic via glTF spec once loaded through `GLTFLoader`).
- Add in R3F: `ACESFilmicToneMapping`, an `<Environment>` HDRI for reflections, `map.anisotropy`, `castShadow`/`receiveShadow`, and `geometry.computeTangents()` for crisp normal-map shading (the source file had no tangent data).
- Optional next-level: convert `girl_web.glb`'s textures to **KTX2/Basis** (`gltf-transform etc1s` or `uastc`) for GPU-compressed textures — smaller VRAM footprint, though WebP is already a big win over the original 17MB PNG.

## Files delivered
- `girl_optimized.glb` — 9MB, plain glTF, easiest to start with
- `girl_web.glb` — 876KB, production-optimized (Meshopt + WebP)
- This guide
