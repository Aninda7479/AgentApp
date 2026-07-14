# Partner / Pet — Build Your Own Companion

SuperAgent ships with a small desktop companion called a **Partner** (you can
think of it as a "Pet"). On the desktop it is a **3D character** in a
transparent, always-on-top window that roams freely across your screen; in the
web build it falls back to a 2D companion inside the app. Either way it keeps
you company and reacts to what the agent is doing:

| Agent state | Partner mood | Default vibe |
| --- | --- | --- |
| Waiting for you | `idle` | resting |
| Planning / streaming | `thinking` | watching |
| Running a tool | `working` | busy |
| Run finished OK | `celebrate` | 🎉 |
| Error / stopped | `sad` | 😿 |
| Idle for a while | `sleeping` | `zzz` |

The format is **fully open**. A Partner is just a `partner.json` file (plus
optional image/model assets). Anyone can author one, **import** it into the
app, and **share** it. This guide shows you how.

---

## 1. The manifest format

Create a folder for your Partner and put a `partner.json` inside it:

```json
{
  "schema": "superagent-partner",
  "id": "nova",
  "name": "Nova",
  "kind": "star",
  "version": "1.0.0",
  "description": "A bright star that twinkles while the agent works.",
  "author": "@you",
  "accent": "#fbbf24",
  "emoji": "⭐",
  "personality": {
    "voice": "warm and cheerful",
    "traits": ["optimistic", "energetic"]
  },
  "reactions": {
    "idle":      { "emoji": "⭐", "line": "Shining and ready.", "animation": "float" },
    "thinking":  { "emoji": "🌟", "line": "Sparking ideas…", "animation": "think" },
    "working":   { "emoji": "💫", "line": "Twinkling away!", "animation": "bounce" },
    "happy":     { "emoji": "✨", "line": "Lovely.", "animation": "bounce" },
    "celebrate": { "emoji": "🌠", "line": "Magic happened!", "animation": "wiggle" },
    "sad":       { "emoji": "🌑", "line": "Clouded over.", "animation": "none" },
    "sleeping":  { "emoji": "🌙", "line": "Resting in orbit.", "animation": "pulse" }
  }
}
```

### Field reference

| Field | Required | Notes |
| --- | --- | --- |
| `schema` | ✅ | Must be exactly `"superagent-partner"`. |
| `id` | ✅ | Stable unique slug: letters, `0-9`, `-`, `_`. Used as the install folder name. |
| `name` | ✅ | Display name. |
| `kind` | ✅ | Species / type, shown as a chip (e.g. `cat`, `robot`, `star`). |
| `description` | ✅ | One line, shown on the card. |
| `version` | — | Defaults to `"1.0.0"`. |
| `author` | — | Handle, shown on the card. |
| `accent` | — | Hex color for the 3D glow / 2D ring. Defaults to `#7c83ff`. |
| `emoji` | — | Default emoji when a mood has none. Defaults to `🐾`. Also rendered as the floating billboard on the 3D pet. |
| `frames` | — | Optional list of asset filenames for frame-by-frame animation. |
| `model` | — | Optional glTF (`.glb`) filename inside the Partner folder; overrides the built-in 3D creature. |
| `animations` | — | Optional `{ mood: clipName }` map for the 3D model. |
| `personality` | — | `{ voice?, traits?[] }` — free-form metadata for the future. |
| `reactions` | — | Map of mood → `{ emoji?, line?, animation?, asset? }`. Any mood may be omitted. |

### Moods

`idle` · `thinking` · `working` · `happy` · `celebrate` · `sad` · `sleeping`

### Animations

`float` · `bounce` · `pulse` · `wiggle` · `think` · `none`

### Reaction resolution

For a given mood the app uses, in order:

1. `reactions[<mood>]` if present,
2. else `reactions.idle` if present,
3. else the Partner's `emoji`.

So you only *need* to define the moods you care about.

---

## 2. Import your Partner into the app

You have three options:

1. **Folder import (easiest).** Open the **Partner** tab → **Import folder**, and
   pick the folder containing your `partner.json`. It is copied into
   `~/AppData/Roaming/OpenSource/AgentApp/pets/<id>/` (your OS user-data dir).
2. **In-app creator.** Open the **Partner** tab → **Create**, fill in the form,
   hit **Save to library**. You can also paste an existing `partner.json` into the
   creator's "Load an existing manifest" box to edit it.
3. **Paste JSON.** Same as above — author the JSON, then **Save to library**.

Built-in Partners (`Pixel`, `Byte`, `Nova`) always ship with the app and can't be
removed, but you can edit and re-save them as your own.

## 3. Set active, export, remove

- **Set active** — the active Partner is the one shown as the 3D desktop pet (or the 2D companion in the web build).
- **Export** — reveals the Partner's folder on disk so you can zip it and share it.
- **Remove** — deletes a *custom* (imported/created) Partner from your library.

## 4. Share it

Zip the Partner folder and share it anywhere (a repo, a Discord, a gist). Anyone
who drops it into the **Import folder** dialog gets your companion. There is no
registry and no gatekeeping — that's the point.

## 5. Worked example

See
[`packages/desktop/examples/partners/nova/partner.json`](packages/desktop/examples/partners/nova/partner.json)
for a complete, ready-to-import Partner. To try it:

```bash
# open the app → Partner → Import folder → select packages/desktop/examples/partners/nova
```

## 6. The 3D desktop pet

On the desktop app your active Partner is rendered as a **3D character** in a
transparent, always-on-top window that roams freely across your whole screen —
it is not trapped inside the SuperAgent window.

The default character is an **anime-waifu companion** (a cute girl who sits with
a laptop and a head pillow). She reacts to the agent and to you:

| Behavior | What happens | Trigger |
| --- | --- | --- |
| Working | types on the laptop (fingers jiggle) | agent streaming / running a tool |
| Idle | sits, laptop on lap, gentle breathing | AI idle, first 10 min |
| Sleeping | head on the pillow, laptop fallen (screen down) | idle > 10 min |
| Laying lonely | curled up, hands folded, laptop fallen | idle > 30 min |
| Walk / jump | stands, holds the laptop, hops | **right-click + drag** her |
| Poke | startled recoil on the clicked body part | **left-click** a body part |
| Dark circles | tired eyes when the context is nearly full | context window ≥ 90% used |
| Talking | surprised face + lip-sync + speech bubble (+ sound) | agent needs input |
| Celebrate | arms up, little hop | agent run finished (`done`) |
| Sad | sulks | agent errored / aborted |

**Interactions**
- **Right-click + drag** → she walks/jumps while you move her around the desktop.
- **Left-click a body part** → she reacts as if poked.
- **Bottom-right grip** → drag to resize her from a small pet up to full screen;
  she auto-scales to fill the window.

Set `SUPERAGENT_DISABLE_PET=1` to turn the 3D pet off entirely (the web build
uses the 2D companion instead).

### The character: procedural by default, VRM when you add one

The default pet is a **built-in procedural waifu** assembled from Three.js
primitives (head, torso, arms, hands, legs, a hinged laptop, a pillow) — no asset
file required, and it already does every behavior above. It's the immediate,
fully-working character.

To get a **realistic anime girl**, drop a VRoid-exported **`.vrm`** into the
Partner folder and reference it via the `vrm` field (see below and
[`packages/desktop/examples/partners/waifu/`](packages/desktop/examples/partners/waifu)).
VRM carries native facial **blendshape expressions**, so "talking" lip-sync,
"dark circles", happy/sad/celebrate all work on the real face. The pet loads it
via `three-vrm` and **falls back to the procedural waifu** if the `.vrm` is
missing or fails to load — it will never crash.

### Custom 3D models (advanced)

A Partner can reference either:

- **`vrm`** — an anime character (`.vrm` from VRoid Studio). Recommended for the
  waifu look; gives you the facial expressions.
- **`model`** — a glTF/`.glb` humanoid, with `animations` mapping each mood to a
  named clip. (Auto-picks a clip by keyword — `idle`, `walk`, `cheer`, `sad` — if
  a mood has no explicit clip, and falls back to the first clip.)

```json
{
  "schema": "superagent-partner",
  "id": "waifu",
  "name": "Waifu",
  "kind": "human",
  "description": "A cute anime companion.",
  "accent": "#ff8fb3",
  "vrm": "character.vrm",
  "laptop": true,
  "pillow": true,
  "dialogues": { "working": "Typing away…", "celebrate": "Yay! 🎉" },
  "animations": { "idle": "Idle", "working": "Walk", "celebrate": "Cheer", "sad": "Sad" }
}
```

### New manifest fields

| Field | Notes |
| --- | --- |
| `vrm` | Filename of a VRoid `.vrm` inside the Partner folder. Loaded as the 3D character with native expressions. |
| `laptop` | Show the laptop prop (default `true`). |
| `pillow` | Show the head pillow prop (default `true`). |
| `dialogues` | `{ mood: line }` lines shown in the pet's speech bubble. |

See
[`packages/desktop/examples/partners/waifu/`](packages/desktop/examples/partners/waifu)
for a ready-to-use waifu Partner.

## Tips

- Keep `emoji` widely supported (most platforms render the same glyph). If you
  want pixel-art instead, set `frames` to image filenames inside the folder and
  reference them via `reactions.<mood>.asset`.
- `accent` drives the glow — pick a color that reads on both light and dark canvases.
- Short `line`s read best; the speech bubble is tiny.
