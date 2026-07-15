# Remove unused keyboard Shortcuts settings panel (`ShortcutsSettings.tsx`)

- **Date:** 2026-07-15
- **Type:** Dead code removal
- **Category:** Maintenance / bundle hygiene

## Summary
Deleted `packages/desktop/src/renderer/settings/ShortcutsSettings.tsx`, a
read-only keyboard-shortcuts list panel (`React.FC`) that is never imported or
rendered. Like `ServersSettings.tsx`, it was never wired into `SettingsView`.

## Why it's an improvement
- Dead component compiled into the renderer bundle on every build for no benefit.
- Its absence from `SettingsView` means the shortcuts data it displayed was
  unreachable from the UI; keeping an orphan component hid that fact and risked
  rot (the binding list would silently drift from the real shortcuts).
- If a shortcuts panel is wanted later, it should be re-added intentionally and
  wired into `SettingsView` rather than left as an unreachable file.

## Verification
- `grep` for `ShortcutsSettings` across `packages/` → only its own source + `dist/`.
- No string-keyed settings registry references a `shortcuts` category.
- `tsc --noEmit` on `packages/desktop` → exit 0 (no breakage).

## Files changed
- `packages/desktop/src/renderer/settings/ShortcutsSettings.tsx` — removed
  (was marked `// @UNUSED`).
