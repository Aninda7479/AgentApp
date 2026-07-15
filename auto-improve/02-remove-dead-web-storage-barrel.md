# Remove dead web storage barrel (`web/src/storage/index.ts`)

- **Date:** 2026-07-15
- **Type:** Dead code removal
- **Category:** Maintenance / bundle hygiene

## Summary
Deleted `packages/web/src/storage/index.ts`, a re-export barrel
(`export * from './types.js'`, `./paths.js'`, `./conversation-store.js'`).
`packages/web/src/server.ts` imports those symbols directly from their concrete
files, so the barrel is never used.

## Why it's an improvement
- `esbuild` only bundles `ipc-bridge.ts` as the client entry and `server.ts`
  (via `tsc`) as the server; the barrel was compiled but never linked.
- Removes a misleading "public API" surface for the storage module that nothing
  actually consumes, reducing confusion about the real storage entry points
  (`conversation-store.ts`, `paths.ts`).

## Verification
- `grep` for `storage/index` / `storage'` in `packages/web` → no source imports.
- `tsc --noEmit` on `packages/web` → exit 0 (no breakage).

## Files changed
- `packages/web/src/storage/index.ts` — removed (was marked `// @UNUSED`).
