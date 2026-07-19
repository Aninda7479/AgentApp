---
name: atmosphere-dashboard
description: Unified visual design system for SuperAgent — fuses the "layered atmosphere" nature-illustration art direction (focal disc, layered horizon bands, atmosphere/contour modes, calm contemplative motion) with the dark structured product chrome captured from the reference OAuth-connections screenshot (near-black canvas, sidebar nav, pill filters, status-tinted rounded cards, muted chrome against saturated brand-icon accents). This is a SINGLE merged design language, not a choice between two — every page or component this skill touches must express BOTH halves at once. Use whenever a page, screen, component, or icon set needs designing or redesigning, regardless of which part of the product it lives in. Verification happens by reading the rendered component/CSS/markup source directly (Read/Grep) and checking it against the token list and checklist below — this skill never opens a browser, takes a screenshot, or uses Playwright or any other MCP automation tool to "see" its own work.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, TodoWrite
argument-hint: [optional page/component, e.g. "oauth-connections", "sidebar-nav", "empty-state"]
---

# /atmosphere-dashboard — Unified Design Skill

## The one rule this whole file exists to enforce

There is no "illustration mode" and a separate "app mode." There is one language with two registers, and a real design pass uses both every time:

- **Atmosphere register** — where the product needs a focal, emotional, or decorative moment (empty states, onboarding, hero banners, loading/success illustrations, the subtle field texture behind everything). Nature-derived: a focal disc, layered horizon bands, calm drifting motion.
- **Structure register** — where the product needs to be scanned, filtered, and acted on (nav, cards, forms, filters, status). Dark, dense, muted chrome with rounded geometry and semantic color tinting, captured directly from the reference screenshot.

A page that's all atmosphere reads as a marketing splash with no product in it. A page that's all structure reads as the generic dark-dashboard template everyone already has. Every deliverable from this skill should be identifiably *both* — structure carrying the weight of usability, atmosphere carrying the weight of identity.

If you're ever unsure which register a given element belongs in: chrome the user acts on (buttons, inputs, list rows, nav, status) is structure; anything the user just looks at or that fills empty/quiet space (backgrounds, dividers, empty states, loading, celebratory moments, icon linework) is atmosphere.

---

## Part A — Atmosphere philosophy (the illustration/mood half)

Adapted from the original seed direction, re-tuned for a dark product surface rather than a light marketing page — this is dusk, not noon.

**Core motif:** a single focal disc (sun/moon) low against horizontally layered, depth-suggesting bands. Flat, no photographic texture, no busy detail. One clear focal element per composition, generous negative space, motion that drifts or gently rises/settles — never snaps or bounces.

**Two modes, kept distinct, not blended into a compromise:**

- *Atmosphere mode (primary, dusk variant)* — a gradient field moving from deep near-black navy at the top, through a desaturated blue-teal midtone, down to a warm, low-saturation amber/gold glow at the horizon. This is the same emotional move as a sunrise/sunset gradient, just pushed into the product's native darkness instead of a bright sky. Used for section backgrounds, hero/empty-state illustrations, and the faint global/network texture that already bleeds in at the edges of the reference canvas — that texture *is* this skill's atmosphere layer already half-present in the product; lean into it rather than fighting it.
- *Contour mode (alt, for linework and iconography)* — strict, nearly-monochrome flowing linework on the dark ground: concentric horizon contours instead of flat silhouette fills. This is the register for hand-authored SVG iconography, dividers, and any original marks the product needs (a bird-flock mark, a loading spinner built from concentric arcs) — mid-century-poster energy, graphic and calm, never competing with the brand-color app icons that live in the card grid.

**What atmosphere is never allowed to do:** sit behind or around dense functional content (card grids, forms, tables) as decoration — it stays confined to the quiet zones (empty states, headers before the first data-dense element, loading/success moments, the ambient field texture). It never gets busy enough to fight legibility.

---

## Part B — Structural system (captured from the reference screenshot)

This is the literal system observed in the OAuth-connections reference. Treat it as ground truth for chrome; don't reinterpret it loosely.

### Canvas & surfaces
- App background: near-black navy, essentially no hue warmth — `#0A0D16`–`#0C0F1A`.
- Sidebar: same family, marginally distinct from canvas — `#0D1119`.
- Default card/panel surface: `#12151F` with a 1px low-contrast border (`#242A38` at ~40% opacity) — borders do the elevation work here, not shadows. This UI is flat by design; don't add drop shadows to compensate.
- Corner radius is generous and consistent: ~16–20px on cards and panels, fully pill-shaped (999px) on search bars and filter tabs, ~10–12px on sidebar nav rows.

### Semantic status tinting (the core structural idiom)
Every stateful item (a connection, a task, a sync) gets a *whole-card* low-saturation tint, not just a colored label:
- **Connected / success** — dark desaturated green background wash (`#142018`-ish), green text (`#22C55E`–`#4ADE80`), matching green-tinted border.
- **Auth expired / error** — dark desaturated rust wash (`#201414`-ish), rust-red text (`#DC6B5D`), matching border.
- **Preview / pending** — dark desaturated amber wash (`#201A10`-ish), gold/amber text (`#D4A843`), often paired with a dashed border to additionally signal "not yet real."
- **Neutral / unconnected** — no tint at all, plain default surface. Silence is itself a state; don't tint things that have nothing to report.

The rule: color communicates state, never decoration. If a card isn't in a state, it stays in the muted default surface.

### Chrome stays muted; only content is saturated
UI chrome — text, borders, backgrounds, icons Claude authors itself — stays desaturated and low-contrast. The *only* fully-saturated color in the reference comes from third-party brand marks (app logos in the card grid). Preserve that contrast: hand-authored elements should never compete in saturation with real content/brand color. This is also where contour-mode linework earns its keep — it's built to sit quietly under saturated content rather than beside it as another loud element.

### Typography & hierarchy
- Page title: large, bold, off-white (`#F5F5F7`), top-left of the content column.
- Subtitle: directly beneath the title, same left edge, smaller, muted gray (`#8B93A6`).
- Section/eyebrow labels (e.g. sidebar group headers): small, uppercase, letter-spaced, most muted gray in the system (`#5C6470`) — these exist to be skimmed past, not read.
- Body/description copy: contained in a bordered panel, left-aligned, generous line-height, muted gray, width-constrained rather than full-bleed.
- Card labels: centered under their icon, medium-weight, off-white; status subtext directly beneath in the semantic status color, one size down.

### Layout idioms to reuse deliberately
- **Sidebar nav row:** icon left, label right, one consistent row height and padding throughout; the active route gets a distinct rounded outline/box in accent blue (`#4C8DFF`-ish) rather than a filled background — outline-as-selection, not fill-as-selection.
- **Search bar:** full-width pill, icon-left, placeholder vertically centered, background one step lighter than canvas.
- **Filter tabs:** horizontal row of pills, icon+label inline; the active tab inverts to a light fill with dark text — the single place in this system where light-on-dark contrast flips, which is exactly why it reads as "selected" so clearly. Don't reuse that inversion trick anywhere else or it stops meaning "selected."
- **Card grid:** uniform, near-square cards, strict vertical centering of icon → label → status. Consistency of the grid matters more than any single card's flourish.
- **Badges:** small filled circle, top-right corner overlap on the icon, for counts/notifications only — never for status (status is the whole-card tint, not a badge).

---

## How the two halves combine on a real page

For any page or component, run both passes, in this order:

1. **Structure pass first.** Lay the page out with Part B: what's nav, what's a card grid, what's a form, what needs status tinting. Get this right before touching mood — a beautifully atmospheric page that's hard to scan is a failure of this skill's whole premise.
2. **Atmosphere pass second, and only in the quiet zones.** Identify the page's one or two quiet moments (a header band before the data starts, an empty state, a loading/success transition, the ambient background texture) and give those the dusk gradient / focal-disc / contour-linework treatment. If a page genuinely has no quiet zone (it's 100% dense functional grid, like the reference itself), the atmosphere register can legitimately be limited to the faint ambient background texture alone — that's a valid outcome, not a shortfall.
3. **Check the seam.** Where structure meets atmosphere (e.g. a card grid sitting below an atmospheric header), the transition should feel like the horizon bands settling into the UI, not a hard cut between two different apps. A shared gradient stop or a contour-mode divider line at the seam usually does it.

---

## Design tokens (starting point — adjust to project needs, keep the relationships)

```css
:root {
  /* surfaces */
  --canvas: #0A0D16;
  --sidebar: #0D1119;
  --surface: #12151F;
  --surface-border: rgba(36, 42, 56, 0.4);

  /* text */
  --text-primary: #F5F5F7;
  --text-secondary: #8B93A6;
  --text-eyebrow: #5C6470;

  /* accent / selection */
  --accent-blue: #4C8DFF;

  /* semantic status */
  --status-success-bg: #142018;
  --status-success-text: #22C55E;
  --status-error-bg: #201414;
  --status-error-text: #DC6B5D;
  --status-preview-bg: #201A10;
  --status-preview-text: #D4A843;

  /* atmosphere register (dusk gradient) */
  --atmosphere-sky-top: #0A0D16;
  --atmosphere-sky-mid: #1B3A4B;   /* desaturated blue-teal */
  --atmosphere-horizon: #D9A65C;  /* warm, low-saturation amber glow */
  --atmosphere-contour-line: #3A4252; /* near-monochrome linework on dark ground */

  /* radii */
  --radius-card: 18px;
  --radius-pill: 999px;
  --radius-nav-row: 11px;
}
```

---

## Component patterns

**Status card**
```
[icon, brand-saturated]
Card Label            ← --text-primary, medium weight, centered
Status subtext         ← --status-*-text, one size down, centered
```
Whole card background/border = the matching `--status-*-bg` pair. No tint for neutral cards.

**Sidebar nav row (active)**
```
border: 1px solid var(--accent-blue);
border-radius: var(--radius-nav-row);
background: transparent;   /* outline, not fill */
```

**Filter pill (active vs inactive)**
- Active: light/off-white fill, dark text — the one deliberate contrast inversion in the system.
- Inactive: transparent/dark fill, `--text-secondary`, 1px `--surface-border`.

**Atmosphere header band**
```
background: linear-gradient(180deg,
  var(--atmosphere-sky-top) 0%,
  var(--atmosphere-sky-mid) 55%,
  var(--atmosphere-horizon) 100%);
```
Focal disc: a single flat circle (SVG), placed low in the band, slightly overlapping the horizon stop — the one illustration element allowed to be the eye's landing point.

---

## Workflow

### Step 0 — Orient
Read this file's Part A/B in full once. If `.claude/art-direction.md` exists from a prior run of an older skill, treat it as superseded by this file — don't split the language back into two documents. Check whether the target page/component already has design-token variables defined somewhere in the codebase (Grep for `--canvas`, `--surface`, etc.) before inventing new ones; reuse what's there.

### Step 1 — Pick a target
Use `$ARGUMENTS` if given, otherwise the next untouched page/component or one flagged in a queue log. Prefer breadth (one honest pass over many pages) before depth (a second pass on one page).

### Step 2 — Read before changing
`Grep` the target component/CSS for the section you need; `Read` with `offset`/`limit` rather than pulling a whole file in for orientation. Note current structure-register and atmosphere-register elements (or their absence) before editing.

### Step 3 — Design (structure pass, then atmosphere pass, per "How the two halves combine" above)
Keep changes scoped to the current page/component per pass. Reuse existing hand-authored SVG/CSS assets and design tokens where they already exist rather than re-deriving them.

### Step 4 — Verify by reading code, not by looking at it render
This is the deliberate departure from screenshot-based self-critique: **no browser, no Playwright, no screenshot tool of any kind.** Instead, re-read the changed files and check them against this list, mechanically:
- [ ] Every color used traces back to a token in the list above (or a newly, deliberately added one) — no ad hoc hex values left in the diff.
- [ ] Every stateful element's tint follows the whole-card semantic pattern (background + border + text all agree on the same status), not just a colored label bolted onto an otherwise neutral card.
- [ ] Corner radii match the scale (card/pill/nav-row) — nothing invented a fourth radius.
- [ ] Chrome the model authored (borders, backgrounds, its own icons) stays desaturated; the only saturated color in the diff belongs to real content/brand marks.
- [ ] Atmosphere-register CSS/SVG (gradients, focal disc, contour linework) only appears in quiet zones identified in Step 3, not layered behind dense functional content.
- [ ] Text hierarchy (title → subtitle → eyebrow labels → body → card label → status subtext) uses the right token at each level, matching Part B.
- [ ] If this page has an active/selected state, it uses the outline-for-nav or invert-for-pill convention as appropriate — not a third, novel selection style.

Grep for any hardcoded color literals in the changed files as a mechanical check for the first bullet; a hit that isn't a deliberate, logged new token is a fail. Fix findings and re-check once; if something still doesn't fully hold up after one fix pass, log the specific gap rather than iterating further — same discipline as the checklist above being a fixed list, not a vibe.

### Step 5 — Regression check
Run whatever build/lint/test the project already has, output piped to a file; read only the failing region or a one-line "passed." A change that looks right on paper but breaks the build is not done.

### Step 6 — Log
One line: page/component touched, which registers were used where, any new token introduced and why, any gap the checklist caught that wasn't fully resolved.

---

## Guardrails

- Never reproduce a specific found image, icon set, or brand illustration — synthesize original work in this language.
- Never split this back into two separate design documents ("the mood board" vs "the app system") — one page, both registers, always.
- Never let atmosphere-register decoration sit behind or beside dense functional content — it belongs in quiet zones only.
- Never invent a new selection-state convention beyond outline-for-nav / invert-for-pill without logging why the existing two didn't fit.
- Never verify a design change by rendering it in a browser or taking a screenshot — verification is a code-read against the checklist in Step 4, full stop.
- Never introduce a fully-saturated hand-authored color; saturation in this system is reserved for real content and third-party brand marks.