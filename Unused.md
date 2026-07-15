# Unused / Useless Files

Generated 2026-07-15 by static import-graph analysis (NodeNext `.js`→`.ts`
resolution, barrel re-exports, dynamic `import()`/`require()`, test + esbuild
entry points) plus manual verification (direct `grep` of every candidate).

Scope: every file in the working tree that is **not part of the active
codebase or build** — source orphans, standalone scripts, generated data
dumps, and gitignored local artifacts. Essential files (`package.json`,
`tsconfig*.json`, `Dockerfile`, `README.md`, `LICENSE`, `CONTRIBUTING.md`,
`docs/*`, `node_modules/`, `dist/`) are intentionally excluded.

---

## 1. Dead source files (orphans — not imported by any entry point or module)

These were also tagged with a `// @UNUSED` comment in-source.

| File | Type | Why unused |
|------|------|------------|
| `packages/desktop/src/renderer/index.ts` | `.ts` barrel | No module imports this renderer barrel. |
| `packages/desktop/src/renderer/settings/ServersSettings.tsx` | `.tsx` | Settings panel never imported (not wired into `SettingsView`). |
| `packages/desktop/src/renderer/settings/ShortcutsSettings.tsx` | `.tsx` | Settings panel never imported. |
| `packages/web/src/storage/index.ts` | `.ts` barrel | Storage barrel never imported by the web server. |

## 2. Unreferenced root scripts (standalone `.mjs`, not in `package.json` scripts or any import)

A self-contained research/utility toolchain committed at the repo root. Not
invoked by the build, tests, or any other file.

- `analyze-cache.mjs`
- `gen-list.mjs`
- `gen-mcp-catalog.mjs`
- `peek.mjs`
- `research-mcp.mjs`
- `test-extractor.mjs`
- `test-extractor2.mjs`
- `test-fenced.mjs`

## 3. Generated research data dumps (committed, large, not part of the build)

Produced by the scripts in §2; not read by any source or build step.

| File | Size | Type |
|------|------|------|
| `research-cache.json` | ~8.0 MB | `.json` cache |
| `awesome-mcp.md` | ~1.13 MB | `.md` dump |
| `list.md` | ~225 KB | `.md` dump |

## 4. Gitignored local artifacts (safe to delete — not committed)

Already excluded by `.gitignore`; listed for completeness. These are runtime /
tooling output, not source.

- `logs/` (and `*.log`, incl. `research-mcp.log`)
- `graphify-out/`
- `temp/` (incl. `cli_tmp_e2e.mjs`, `tmp_e2e.mjs`, and per-package `tmp/test_tmp_settings_dir_*` dirs)
- `tmp/` (per-package test artifacts)
- `dist/` (build output)
- `node_modules/`

## 5. Files with unused exports (imported, but contain dead exports — review before removing)

These files ARE reachable, but some of their exported symbols are never
consumed. Many are `interface`/`type` exports or consumed only via `import
type`, so treat as **candidates** — verify before deletion.

- `packages/cli/src/index.ts`
- `packages/core/src/index.ts`
- `packages/core/src/planner/diagnostics.ts`
- `packages/core/src/planner/queue.ts`
- `packages/core/src/planner/react.ts`
- `packages/core/src/planner/subagents.ts`
- `packages/core/src/planner/trajectory.ts`
- `packages/core/src/providers/ai-engine.ts`
- `packages/core/src/providers/multimodal.ts`
- `packages/desktop/models/lily/index.ts`
- `packages/desktop/src/builder/installer.ts`
- `packages/desktop/src/gateway/index.ts`
- `packages/desktop/src/main/ai-engine.ts`
- `packages/desktop/src/main/error-log.ts`
- `packages/desktop/src/main/mcp-manager.ts`
- `packages/desktop/src/main/notifications.ts`
- `packages/desktop/src/main/pet-geometry.ts`
- `packages/desktop/src/main/pet-window.ts`
- `packages/desktop/src/main/skills.ts`
- `packages/desktop/src/main/tray.ts`
- `packages/desktop/src/main/window.ts`
- `packages/desktop/src/pet/entry.ts`
- `packages/desktop/src/renderer/BrandLogo.tsx`
- `packages/desktop/src/renderer/components/BottomNav.tsx`
- `packages/desktop/src/renderer/components/DoctorModal.tsx`
- `packages/desktop/src/renderer/components/McpInstallModal.tsx`
- `packages/desktop/src/renderer/components/partner/PetControls.tsx`
- `packages/desktop/src/renderer/components/ShortcutsModal.tsx`
- `packages/desktop/src/renderer/components/slashCommands.ts`
- `packages/desktop/src/renderer/components/WorkspaceView.tsx`
- `packages/desktop/src/renderer/lib/errorReporter.ts`
- `packages/desktop/src/renderer/settings/UpdatesSettings.tsx`
- `packages/desktop/src/renderer/theme.ts`
- `packages/desktop/src/renderer/urlSync.ts`
- `packages/web/src/ai-engine.ts`
- `packages/web/src/auth.ts`
- `gen-mcp-catalog.mjs`
- `research-mcp.mjs`

---

## Flat list (files safe to remove — §1, §2, §3)

```
packages/desktop/src/renderer/index.ts
packages/desktop/src/renderer/settings/ServersSettings.tsx
packages/desktop/src/renderer/settings/ShortcutsSettings.tsx
packages/web/src/storage/index.ts
analyze-cache.mjs
gen-list.mjs
gen-mcp-catalog.mjs
peek.mjs
research-mcp.mjs
test-extractor.mjs
test-extractor2.mjs
test-fenced.mjs
research-cache.json
awesome-mcp.md
list.md
```

### Reviewed and excluded (NOT useless)

The following initially looked orphaned but are actually used and were excluded:

- `packages/desktop/tailwind.config.js` — consumed by the Tailwind build step.
- `packages/web/scripts/build.js` — the web client build script (`build:client`).
- `packages/web/src/ipc-bridge.ts` — listed as an esbuild `entryPoints` in `build.js`.
- `packages/desktop/models/lily/*` — runtime-loaded 3D "Lily" partner (string `script` path in `partner-store.ts`).
- `docs/*` — cross-referenced knowledge base (14–16 internal references each).
