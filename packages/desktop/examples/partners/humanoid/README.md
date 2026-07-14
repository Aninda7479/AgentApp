# Humanoid — a custom 3D character Partner

This Partner ships **without** a model file. Out of the box it renders the
built-in procedural creature (colored by `accent`, with `🧍` floating above it).
To turn it into a **walking, animating humanoid**, drop a glTF model into this
folder and name it `character.glb`.

## 1. Get a model

Free sources that export humanoid glTF/glb:

- **Mixamo** (https://www.mixamo.com) — sign in (free), pick a character, then
  **Animations** → add clips like *Idle*, *Walking*, *Cheering*, *Sad*. Export
  as **FBX**, then convert to **glTF (`.glb`)** using a tool like
  [Blender](https://www.blender.org) (File → Export → glTF 2.0 Binary) or
  `npm i -g gltf-pipeline && gltf-pipeline -i in.fbx -o character.glb`.
- **Ready Player Me** (https://readyplayer.me) — build an avatar, choose
  **Download** → **.glTF binary (.glb)**. Its clips are named e.g. `Idle`,
  `Walking`, `Wave`, `SadIdle`.
- **VRoid Studio** — anime avatars; exports VRM (needs an extra VRM loader, so
  Mixamo/RPM are easier for a first try).

## 2. Place it here

```
examples/partners/humanoid/
├── partner.json      ← already references "model": "character.glb"
└── character.glb     ← the file you add
```

The `animations` map in `partner.json` links each mood to a **clip name inside
your model**:

```json
"animations": {
  "idle":      "Idle",
  "working":   "Walking",
  "celebrate": "Cheering",
  "sad":       "Sad"
}
```

Clip names are **case-sensitive** and must exactly match what's in your `.glb`.
If a mood has no clip (or you omit `animations` entirely), the app auto-picks a
reasonable clip by keyword (`idle`, `walk`, `cheer`, `sad`, …), falling back to
the first clip. If the model is missing or fails to load, it gracefully falls
back to the procedural creature — it will never crash.

## 3. Try it

```
# App → Partner → Import folder → select this folder
# then click "Set active" on Humanoid
```

The pet overlay resizes to a taller window and the character loads. Drag it
anywhere; it roams faster while the agent is working and stands still when sad
or sleeping.

## Notes

- Keep the model modest (a few MB, < 50k triangles) — it animates continuously
  in a transparent always-on-top window.
- `SUPERAGENT_DISABLE_PET=1` turns the 3D pet off entirely.
- Want to share? Zip this folder and send it. Anyone can import it the same way.
