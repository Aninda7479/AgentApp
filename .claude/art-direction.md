# Art Direction — SuperAgent

## Division of Labor
- `/art-director` owns palette, illustration, iconography, motion, layout rhythm, brand voice.
- `/ux-critic` owns bugs, confusion, broken states, accessibility, functional copy clarity.
- Functional bugs spotted during redesign → log under `[art-director]` as open question for `/ux-critic`.

## Direction — "Layered Atmosphere"

A single focal disc (sun/moon) over horizontally layered, depth-suggesting bands, rendered flat.

### Atmosphere mode
- Soft gradient sky: sage/mint → cream → warm peach.
- Layered silhouette "mountains" in desaturated blue-teal deepening to moss/forest green.
- Used as section dividers.

### Contour mode
- Strict monochrome: ivory/cream ground.
- Forms from concentric flowing linework.

### Shared rules
- Generous negative space.
- One clear focal element per composition.
- Motion that evokes drifting or gently rising/settling — never snapping or bouncing.

## Design Tokens (reference values — tune per page)
- Sky top: sage/mint (#A7C4BC-ish)
- Sky mid: cream (#F5EFE6-ish)
- Sky low: warm peach (#F4C7A1-ish)
- Mountain near: desaturated blue-teal (#6B8E9E-ish)
- Mountain far: moss/forest green (#3E5C4B-ish)
- Ground: ivory/cream (#FBF8F1-ish)
- Linework (contour): muted ink (#2E2A24-ish)
- Focal disc: soft warm (#F6D9A0-ish)

## Motion
- Easing: cubic-bezier(0.22, 1, 0.36, 1) (calm settle).
- Durations: 300–600ms for state changes; long ambient drifts 6–12s.
- No bounce, no overshoot, no abrupt snaps.

## Layout Rhythm
- Section padding: generous (e.g. 64–96px vertical on desktop).
- Card padding: 24–32px.
- Nav: quiet, low-contrast separators.
- One focal element per composition; everything else recedes.

## Voice / Tone
- Calm, confident, plain-spoken. No hype, no exclamation.
- Prefer short noun phrases and imperative labels.
- Brand reads as considered, not hobbyist.
