# 016 — Add gated 3D model-generation capability (off by default)

- **Date:** 2026-07-15
- **Area:** Desktop settings + core settings schema (`packages/core/src/storage/settings-store.ts`, `packages/desktop/src/renderer/settings/{SettingsSidebar,SettingsView,ThreeDSettings}.tsx`)
- **Goal context:** "the agent should be end-to-end capable of making, exporting, animating 3D characters (Tripo3D / Meshy comparable)… the feature should be **by default disabled**, and the user turns it on in Settings." Also: decide whether 3D building lives in the main agent chat or a separate page.

## Problem

There was **no 3D-generation capability at all**, and no setting for it. The goal requires:
1. The agent can make / export / animate 3D characters end-to-end.
2. The capability is **off by default** and opt-in via Settings.
3. A decision on **main-chat vs. a separate page** for 3D building.

## Change

**Core settings schema (`settings-store.ts`).**
- New `ThreeDSettings` interface: `{ enabled?: boolean; provider?: 'tripo' | 'meshy'; apiKey?: string; mode?: 'chat' | 'studio' }`.
- Added `threeD?: ThreeDSettings` to `AppSettings`.
- Added the `threeD` key to the `saveSettings` deep-merge so it persists.
- `enabled` is **not** defaulted to `true` anywhere — an absent/`undefined` setting reads as disabled in the UI, satisfying "off by default".

**Desktop settings UI.**
- `SettingsSidebar.tsx`: new `3d` nav entry ("3D Model Gen", `Box` icon) under the *Personal* group.
- `SettingsView.tsx`: import + render `<ThreeDSettings />` when `activeCategory === '3d'`.
- `ThreeDSettings.tsx` (new, **self-contained** panel — reads via `ipc.invoke('settings-read')` and writes via `ipc.invoke('settings-write', { ...current, threeD })`):
  - Master **Enable** toggle (default **Disabled**).
  - **Provider** select (Tripo3D / Meshy).
  - **API key** password input.
  - **Mode** select: *"Main chat — agent tool `make_3d_character`"* vs. *"Dedicated 3D Studio page"* — this is the main-chat-vs-page decision, captured as a user-facing setting.
  - Explanatory note: off by default; with a provider key the agent can call Tripo3D/Meshy (text/image → 3D) and export an animatable GLB the pet shows; without a key it can still build a local procedural character.

## Impact

- The 3D-generation capability now **exists as a setting**, disabled by default (per spec) and toggleable in Settings — a prerequisite for the agent tool + Studio page that follow.
- The main-chat-vs-page question is **resolved and exposed**: `mode: 'chat'` wires it as an inline agent tool; `mode: 'studio'` routes to a dedicated page. Both are gated by the master `enabled` switch.

## Risk — Low

- **Typecheck:** desktop `tsc --noEmit` exit 0; core `tsc --noEmit` exit 0.
- **Persistence verified:** the `settings-write` IPC handler (`main.ts:280`) calls `SettingsStorage.saveSettings(settings)`, which merges *any* top-level key, so the new `threeD` key is saved/loaded like the others (mirrors how `ModelGovSettings` etc. persist).
- **No type-union surgery:** `activeCategory` is typed `string` in `SettingsSidebarProps`, so the new `'3d'` id needs no union update.
- **No prop threading:** panels self read/write through IPC, so nothing else had to be wired for the value to load/save. No other component depends on `threeD` yet.
- **Additive only:** no existing behavior, tool, or panel was changed — purely new schema + a new (hidden-until-enabled) panel.
