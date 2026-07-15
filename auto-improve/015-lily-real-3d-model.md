# 014 — Upgrade built-in Lily to the real 3D girl GLB model

- **Date:** 2026-07-15
- **Area:** Desktop pet / built-in Lily Partner (`packages/desktop/src/main/partner-store.ts`, `packages/desktop/src/main.ts`, `packages/desktop/package.json`, `.gitignore`)
- **Assets:** `packages/desktop/models/lily/v1/girl_optimized.glb` (user-saved), `animating-your-girl-model-guide.md`

## Problem

The built-in **Lily** Partner rendered as a fully **procedural three.js mesh**
(`packages/desktop/models/lily/{index,model,animations,audio}.ts` — a
stylized primitive "doll" built from spheres/capsules/boxes). The user had
saved a **real 3D girl** export to `packages/desktop/models/lily/v1/`
(`girl_optimized.glb` ~9 MB, plus `girl_web.glb`, PBR textures, OBJ), but
it was **never used**.

The pet renderer already had a complete `GLBCharacter` loader
(`packages/desktop/src/pet/entry.ts`, lines ~391–726) that loads **any** GLB
via three's bundled `GLTFLoader`, draws a procedural anime **face overlay**
(eyes / mouth / dark circles / blink / lip-sync) on a faceless mesh, parents
the **laptop + pillow** props, drives whole-body poses, and **falls back to the
procedural Lily** if the file fails. But the built-in Lily manifest was wired to
the procedural `script` instead of the asset:

```ts
// partner-store.ts — DEFAULT_LILY_MANIFEST (before)
script: 'models/lily/index.js',   // ← procedural doll, real GLB ignored
```

So the saved model sat unused while Lily stayed a blocky placeholder.

## Change

1. **`partner-store.ts` — wire Lily to the real GLB.**
   - Removed `script: 'models/lily/index.js'`.
   - Added `model: 'models/lily/v1/girl_optimized.glb'` and `faceOverlay: true`.
   - The `GLBCharacter` loader now picks her up (path → `modelPath` branch in
     `entry.ts` `applyPartner`), keeping the procedural face/props/poses.

2. **`main.ts` — `resolvePartnerModelPath` special-cases the built-in Lily.**
   The resolver joins `model` onto `userData/pets/<id>/`, which **does not
   exist** for the built-in Lily, so `model` would have resolved to `null`.
   Mirroring the old `script` special-case (in `applyDynamicMetadata`), Lily's
   `model` now resolves from the install tree:

   ```ts
   if (id === 'lily' && (model.startsWith('models/') || model.startsWith('dist/'))) {
     const fromInstall = path.join(__dirname, '..', model);
     if (fs.existsSync(fromInstall)) return fromInstall;
     const alt = path.join(__dirname, model);
     if (fs.existsSync(alt)) return alt;
   }
   ```

3. **`package.json` — copy the GLB into `dist/` at build time.**
   Appended a `node -e` step to both `build` and `dev` that copies
   `models/lily/v1/girl_optimized.glb` → `dist/models/lily/v1/`
   (creating the dir, defensive: warns + skips if the source is absent, so the
   build never fails on a clone missing the asset).

4. **`.gitignore` — ignore the heavy source binaries.**
   `*.glb`, `*.obj`, `*.png`, `*.mtl` under `packages/desktop/models/lily/v1/`.
   The procedural Lily is the graceful fallback, so these are never required to
   build or run — this keeps the repo/Docker lean (consistent with #007).

**Why `girl_optimized.glb` and not `girl_web.glb`:** `girl_optimized.glb` is
plain glTF (no `EXT_meshopt_compression`), so three's bundled `GLTFLoader`
decodes it with **zero extra setup**. `girl_web.glb` (~876 KB, smaller but
Meshopt + WebP) would require wiring `MeshoptDecoder` into `GLBCharacter`.
~9 MB is fine for a desktop app and is copied into `dist/` (gitignored), so
it ships via electron-builder's `dist/**` inclusion.

## Impact

- The built-in Lily now renders as the **real saved 3D girl** with the pet
  renderer's existing PBR-quality pipeline (`ACESFilmicToneMapping`,
  `RoomEnvironment` image-based lighting, soft `PCFSoftShadowMap` contact
  shadow) — instead of a primitive doll.
- She still **emotes / talks** (procedural face overlay) and still carries the
  **laptop + pillow** props, because `GLBCharacter` is reused unchanged.
- Behavior is **strictly additive**: the real model loads when present; the
  procedural Lily remains the universal fallback (also used by `GLBCharacter` /
  `VRMCharacter` on any load failure).

## Risk — Low

- **Typecheck:** `tsc -p tsconfig.json --noEmit` on the desktop package
  exits **0** after the edits.
- **Runtime path verified:** the copy step was run manually — 9,375,692 bytes
  copied to `dist/models/lily/v1/girl_optimized.glb`; a simulated resolver
  (`__dirname = dist/main`) resolved `models/lily/v1/girl_optimized.glb` to
  an **existing** path, so the pet will load it.
- **No logic churn:** `GLBCharacter` / `pet-window.ts` / `entry.ts` were not
  touched. Only the *built-in manifest wiring* changed. The procedural `Lily`
  class is preserved intact as the fallback.
- **Graceful degradation verified:** if the GLB is absent (fresh clone without
  the asset), `resolvePartnerModelPath` returns `null` → `entry.ts` skips the
  `modelPath` branch → procedural Lily loads. Nothing breaks.

## Note on `@react-three/fiber` / `@react-three/drei` (requested)

The brief said *"you can try to use three, @react-three/fiber, @react-three/drei."*
This change **uses three.js** (the existing `GLTFLoader` path) — satisfying
"use three." A true `@react-three/fiber` + `@react-three/drei` adoption would
mean rewriting the **entire pet window** (`entry.ts`, ~1000 LOC) from
imperative three.js into a React `<Canvas>` with `useGLTF` /
`useAnimations` / `<Environment>` / `<ContactShadows>` / `<OrbitControls>`.

That pet window is **shared infrastructure** used by *every* Partner (procedural
Lily, VRM, custom GLB, script models) plus the drag/resize/IPC wiring around
it — a large, high-risk rewrite that does not belong in a small
continuous-improvement pass. Crucially, the drei features are **already present,
just implemented imperatively**: drei's `<Environment preset>` = the pet's
`RoomEnvironment` + `PMREMGenerator`; `<ContactShadows>` = the pet's
`ShadowMaterial` ground plane; `useGLTF` = three's `GLTFLoader`.

Installing `@react-three/fiber` / `@react-three/drei` just to call those would
drop an unused React reconciler onto a working vanilla-three scene — i.e. dead
dependencies, the opposite of the cleanup in #01–#06. **Recommendation:**
if you want a genuine R3F rewrite of the pet (it would let Lily use drei's
HDRI `Environment` presets, `ContactShadows`, and `useAnimations` once she's
rigged), that's a separate, larger change I can do as a dedicated pass.
