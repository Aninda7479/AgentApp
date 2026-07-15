# Remove unused MCP Servers settings panel (`ServersSettings.tsx`)

- **Date:** 2026-07-15
- **Type:** Dead code removal
- **Category:** Maintenance / bundle hygiene

## Summary
Deleted `packages/desktop/src/renderer/settings/ServersSettings.tsx`, an
`MCP servers` settings panel (`React.FC<ServersSettingsProps>`) that is never
imported or rendered. `SettingsView.tsx` wires up `GeneralSettings`,
`ProvidersSettings`, `ModelsSettings`, `IntegrationsSettings`, `PetsSettings`,
etc., but never includes `ServersSettings`.

## Why it's an improvement
- It was dead weight compiled into the renderer bundle on every build.
- Its existence suggested an "MCP servers" settings route that doesn't exist,
  misleading contributors (MCP servers are managed via `IntegrationsSettings` /
  the MCP dashboard instead).
- Removing it surfaces the real, smaller set of wired settings panels.

## Verification
- `grep` for `ServersSettings` across `packages/` → only its own source + `dist/`.
- No string-keyed settings registry references a `servers` category.
- `tsc --noEmit` on `packages/desktop` → exit 0 (no breakage).

## Files changed
- `packages/desktop/src/renderer/settings/ServersSettings.tsx` — removed
  (was marked `// @UNUSED`).
