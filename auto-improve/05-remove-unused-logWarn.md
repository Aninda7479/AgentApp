# Remove unused `logWarn` export (`main/error-log.ts`)

- **Date:** 2026-07-15
- **Type:** Dead code removal
- **Category:** Maintenance

## Summary
Removed the exported `logWarn(context, message)` function from
`packages/desktop/src/main/error-log.ts`. Every other symbol in that module
(`logError`, `errorMessage`, `registerErrorToasts`, `IpcErrorEnvelope`) is
consumed by `main.ts`, `partner-store.ts`, and `conversation-store.ts`, but
`logWarn` had **zero** call sites anywhere in the repo (including tests and
dynamic imports).

## Why it's an improvement
- Dead public API that implied a "warn" logging path existed; it never did, so
  contributors might assume warnings were surfaced when they weren't.
- One less symbol to maintain and reason about in the centralized error-logging
  module.

## Verification
- `grep -rn logWarn` across `packages/` (all extensions) → only the definition.
- Importers of `error-log.ts` (`main.ts`, `partner-store.ts`,
  `conversation-store.ts`) import only `logError` / `errorMessage` /
  `registerErrorToasts` / `IpcErrorEnvelope`.
- `tsc --noEmit` on `packages/desktop` → exit 0.

## Files changed
- `packages/desktop/src/main/error-log.ts` — removed `logWarn`.
