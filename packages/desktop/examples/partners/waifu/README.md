# Waifu — a 3D anime companion

This Partner brings the **anime-waifu desktop pet** to life: a cute girl who sits
with a laptop and a head pillow, and reacts to the agent (works while it runs,
celebrates on success, sleeps when idle, talks when she needs something).

## Out of the box (no model needed)

`partner.json` references `character.vrm`, but **you don't have one yet** — and
that's fine. Until you drop a real `.vrm` into this folder, the app shows a
**built-in procedural waifu** (a stylized figure built from 3D primitives) that
already does everything: typing on the laptop, sleeping with her head on the
pillow, laying curled up, walking when you right-drag her, poking when you
left-click a body part, and showing a speech bubble when she "talks."

## Upgrade to a real anime girl (VRM)

1. Make a character in **VRoid Studio** (https://vroid.com/en/studio) — free,
   browser-based, exports anime avatars.
2. **Export → VRM 1.0** and save it as `character.vrm` **in this folder** (next to
   `partner.json`).
3. In the app: **Partner → Import folder** → select this folder → **Set active**.
   The pet reloads as your VRoid girl, with native facial expressions (talking
   lip-sync, dark-circles when the context window is ~full, happy/sad/celebrate).

> Why VRM? It's the anime standard and carries **blendshape expressions**
> (happy / sad / surprised / angry / mouth `aa·ih·ou`) so the "talking" and
> "dark-circles" looks work natively — glTF/Mixamo models wouldn't give you the
> face. The loader uses `three-vrm`.

## Behavior → what triggers it

| Behavior | Trigger |
| --- | --- |
| Working (typing) | agent is streaming / running a tool |
| Idle (sitting) | AI idle, first 10 min |
| Sleeping (head on pillow, laptop fallen) | idle > 10 min |
| Laying lonely (curled, laptop fallen) | idle > 30 min |
| Walk / jump (laptop in hand) | **right-click + drag** her |
| Poke reaction | **left-click** a body part |
| Dark circles | context window ≥ 90% used |
| Talking (face + bubble + sound) | agent needs input (e.g. missing API key) |
| Celebrate (hurray) | agent run finished |
| Sad | agent errored / aborted |

## Resize

Drag the **bottom-right grip** to make her larger (up to full screen) or smaller
(down to a floor). She auto-scales to fill the window. Right-drag moves her
around the desktop.

## Notes

- Keep the `.vrm` reasonably light (a few MB). She animates continuously in a
  transparent always-on-top window.
- `SUPERAGENT_DISABLE_PET=1` turns the pet off entirely.
- `laptop` / `pillow` can be set to `false` in `partner.json` to hide the props.
- `dialogues` are the lines she says per mood (shown in the speech bubble).
