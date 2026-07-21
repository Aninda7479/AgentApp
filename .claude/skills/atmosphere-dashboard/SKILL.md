---
name: atmosphere-dashboard
description: Unified SuperAgent design language — dark structured chrome plus layered-atmosphere quiet zones. Use when designing or restyling any page/component. Verify by reading code against tokens/checklist (no browser required). Prefer existing CSS variables over new hex.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, TodoWrite
argument-hint: [optional page/component, e.g. "sidebar", "oauth-connections", "empty-state", "settings"]
---

# /atmosphere-dashboard — Design system apply pass

**First read:** `.claude/skills/_shared/RESULTS-CONTRACT.md`  
**Also:** `.claude/art-direction.md` if present (tokens here win on conflict for product chrome).

## One language, two registers

- **Structure:** near-black canvas, muted chrome, status-tinted cards, pill filters, outline-active nav.  
- **Atmosphere:** dusk gradient, focal disc, contour linework — **only in quiet zones** (empty states, heroes, ambient texture).

Never all-mood splash or all-generic dashboard.

## Tokens (reuse; do not invent parallel palettes)

```css
:root {
  --canvas: #0A0D16;
  --sidebar: #0D1119;
  --surface: #12151F;
  --surface-border: rgba(36, 42, 56, 0.4);
  --text-primary: #F5F5F7;
  --text-secondary: #8B93A6;
  --text-eyebrow: #5C6470;
  --accent-blue: #4C8DFF;
  --status-success-bg: #142018;
  --status-success-text: #22C55E;
  --status-error-bg: #201414;
  --status-error-text: #DC6B5D;
  --status-preview-bg: #201A10;
  --status-preview-text: #D4A843;
  --atmosphere-sky-top: #0A0D16;
  --atmosphere-sky-mid: #1B3A4B;
  --atmosphere-horizon: #D9A65C;
  --atmosphere-contour-line: #3A4252;
  --radius-card: 18px;
  --radius-pill: 999px;
  --radius-nav-row: 11px;
}
```

If the repo already defines these under another name, **map to existing tokens** instead of duplicating.

## Cycle

### 0) Orient — Grep existing tokens; soft lock if editing

### 1) Target one component/page

### 2) Structure pass then atmosphere pass

### 3) Verify by code checklist (no Playwright)

- [ ] Colors are tokens, not ad-hoc hex (except deliberate new token logged)  
- [ ] Status = whole-card tint  
- [ ] Radii on scale  
- [ ] Atmosphere only in quiet zones  
- [ ] Build passes  

### 4) Commit + one-line log

Prefix: `style:` or `atmosphere-dashboard:`. Tag `[atmosphere-dashboard]`.

## Guardrails

- No screenshot self-critique required.  
- No research ritual.  
- No functional refactors.  
