# Remove dead desktop renderer barrel (`renderer/index.ts`)

- **Date:** 2026-07-15
- **Type:** Dead code removal
- **Category:** Maintenance / bundle hygiene

## Summary
Deleted `packages/desktop/src/renderer/index.ts`, an unused re-export barrel
(`export * from './App'`, `./components/Sidebar'`, …). No module in the repo
imports this barrel — `App.tsx` and friends import their symbols directly from
the concrete modules.

## Why it's an improvement
- The barrel was recompiled by `tsc` on every build even though nothing consumed it.
- Re-export barrels create ambiguity for tree-shaking and make it harder to tell
  which modules are actually live (this one masked the fact that two settings
  panels beneath it were also dead).
- Removing it shrinks the maintenance surface and eliminates a confusing
  "entry-looking" file that isn't one.

## Verification
- `grep` for `renderer/index` across `packages/` → only `dist/` (build output) matches.
- No `import(...)` / `require(...)` references it.
- `tsc --noEmit` on `packages/desktop` → exit 0 (no breakage).

## Files changed
- `packages/desktop/src/renderer/index.ts` — removed (was marked `// @UNUSED`).
