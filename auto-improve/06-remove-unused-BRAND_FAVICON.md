# Remove unused `BRAND_FAVICON` export (`renderer/BrandLogo.tsx`)

- **Date:** 2026-07-15
- **Type:** Dead code removal
- **Category:** Maintenance

## Summary
Removed the unused `BRAND_FAVICON` data-URI constant from
`packages/desktop/src/renderer/BrandLogo.tsx`. The `BrandLogo` React component
is consumed widely, but `BRAND_FAVICON` had **zero** references anywhere
(including the `index.html` / auth HTML pages and tests).

## Why it's an improvement
- Eliminates a stale constant that duplicated the `BrandLogo` glyph as a raw
  SVG data URI. If a favicon is ever needed, the renderer favicon is better set
  from the shared `BrandLogo` source (single source of truth) rather than a
  hand-copied string that would silently drift.
- Keeps the brand module to a single, actually-used export surface.

## Verification
- `grep -rn BRAND_FAVICON` across `packages/` → only the definition.
- `tsc --noEmit` on `packages/desktop` → exit 0.

## Files changed
- `packages/desktop/src/renderer/BrandLogo.tsx` — removed `BRAND_FAVICON`.
