# Art Direction — "layered atmosphere"

A single focal disc (sun/moon) over horizontally layered, depth-suggesting bands,
rendered flat with no photographic texture. Two coherent palette modes, not a
compromise between them:

- **Atmosphere mode** (primary) — soft gradient sky (sage/mint through cream to warm
  peach), layered silhouette "mountains" in desaturated blue-teal deepening to
  moss/forest green, used as section dividers and backgrounds, never as busy
  decoration behind text.
- **Contour mode** (alt, for dark or print-style contexts) — strict monochrome,
  ivory/cream ground, forms built from concentric flowing linework instead of flat
  fills. Mid-century poster energy, bold and graphic.

Shared rules regardless of mode:
- generous negative space
- one clear focal element per composition
- calm/contemplative over busy/techy
- motion that evokes drifting or gently rising/settling rather than snapping or bouncing

This is a mood to synthesize into something original, not a specific image to copy.
Never reproduce a found reference directly — build your own shapes, gradients, and
line work that live in this world.

## Building blocks
- **Illustration/icons: hand-authored SVG first.** Layered mountain silhouettes,
  wave/contour line patterns, a sun/moon disc, simple bird-flock marks — authored
  directly as themeable SVG components (palette fed in, not hardcoded per use).
- **Motion: CSS/SVG-native.** CSS transitions/keyframes or SVG `<animate>`/
  `animateTransform`; use Framer Motion only if the project already does.
- **Raster imagery: only via a free/local image-gen model, once connected.** Until
  then, stay in hand-authored SVG territory — the stronger fit for this style anyway.
- **Icon sets:** restyle/extend the project's existing set (Lucide/Phosphor/etc.)
  rather than introducing a second icon system.

## Established decisions (logged)
- 2026-07-17 (seed): adopted "layered atmosphere" as the canonical direction.
