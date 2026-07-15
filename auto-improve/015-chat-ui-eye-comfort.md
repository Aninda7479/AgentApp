# Chat UI eye-comfort & readability (spacing, size, line-height)

- **Date:** 2026-07-15
- **Type:** UX / readability improvement
- **Category:** Design (margins, colors comfortable for the eyes)
- **Source:** Online research on eye-comfort dark themes + AI chat UI spacing best practices.

## Research basis
- **Eye-comfort (dark):** text should be off-white (not pure `#FFF`), line-height
  **1.65–1.75** and slight **letter-spacing (0.01–0.02em)** because light text
  "spreads"/bleeds on dark backgrounds; avoid pure black backgrounds (already
  done here — bg is `#0a0a0c`, text `#ECEDEF`).
- **Chat spacing:** message column max-width **768–900px** (longer lines slow
  reading ~20%), **14–16px** message text, **24–32px** bottom padding so the
  last message isn't tucked under the input, message gap 16–24px.

## Changes (`packages/desktop/src/renderer/components/TrajectoryCanvas.tsx`)
The conversation view rendered here already used a near-ideal palette; the gaps
were chat *spacing/sizing*, not color. Applied research-backed tweaks:

1. **Column width** `max-w-[760px]` → `max-w-[820px]` (line ~471) — sits inside
   the research-recommended 768–900px readable measure; keeps ~60–70 char lines.
2. **Bottom padding** scroll container `py-6` → `pt-6 pb-8` (line ~468) — 32px
   bottom breathing room so the final message clears the composer.
3. **User bubble text** `text-[13px] leading-relaxed` → `text-[14px] leading-[1.7]
   tracking-[0.01em]` (line ~504) — 14px body (research 14–16px) with relaxed
   line-height + subtle letter-spacing for dark-mode comfort.
4. **Assistant markdown** base `leading-relaxed` → `text-[14px] leading-[1.7]
   tracking-[0.01em]` (line ~389) — matches the user bubble so both sides read
   at a consistent, comfortable size/spacing.

## Why it's an improvement
- Larger, better-spaced message text reduces eye strain during long sessions on
  the dark canvas (the app's default theme).
- Wider-but-bounded column improves scanning speed without full-width "alert"
  feeling.
- Purely presentational — no logic, state, or API change; Tailwind-only edits.

## Verification
- All four edits are valid Tailwind v4 utilities (`max-w-[820px]`, `text-[14px]`,
  `leading-[1.7]`, `tracking-[0.01em]`, `pt-6 pb-8`) — no TS/syntax change.
- Pre-existing palette already satisfies WCAG AA: `text-muted` `#86868F` on card
  `#17171b` ≈ 4.9:1; off-white text, never pure `#000`/`#FFF`.
- File is uncontested (parallel process is working on the `lily` 3D model and
  `partner-store.ts`, not this component).

## Files changed
- `packages/desktop/src/renderer/components/TrajectoryCanvas.tsx` — chat column
  width, bottom padding, and message text size/line-height/letter-spacing.
