# art-director environment notes

GUI location:
- React app (Electron desktop): packages/desktop/src/renderer/ (App.tsx, BrandLogo.tsx, AppToast.tsx)
- Web server + standalone auth pages: packages/web/src/server.ts (Express) and
  packages/web/src/login.html, packages/web/src/account.html

Dev server / live instance:
- packages/web listens on PORT 3000 (default) — this is the user's LIVE instance
  (confirmed: http://localhost:3000 → 302 /login). DO NOT disturb. Port 3001 also
  responds (separate static/app instance) — also leave alone.
- For visual testing use file:// direct load of the standalone HTML (see below).
  Do NOT boot a second web server against the live app.

Auth:
- Web server gates /app behind /api/auth; /login and /account are PUBLIC standalone
  pages (served before the gate). The standalone HTML files are self-contained:
  inline CSS, no linked stylesheets/scripts, favicon is a data URI. Their JS makes
  /api/* fetches that 404 on file:// but are caught and harmless for screenshots.

Visual-test approach (zero-risk, no server):
- mcp__playwright__browser_navigate to file:///D:/Project/OpenSource/AgentApp/packages/web/src/<page>.html
- mcp__playwright__browser_take_screenshot with filename under .playwright/ (REQUIRED — raw results blow the context budget)
- Account page: .../packages/web/src/account.html  (restyle target, queue #3)
- Login page:  .../packages/web/src/login.html     (reference/target aesthetic, DONE)

Established design system (packages/desktop/src/renderer/BrandLogo.tsx + login.html):
- "Layered atmosphere" — single warm disc over horizontally layered mountain
  silhouettes, flat, no photo texture. Dusk variant on auth pages: deep navy→teal→
  moss gradient sky, warm-sand accent #d9a066 / hover #e7b27d / text #1a1410.
- Auth-page atmosphere: .atmosphere (fixed, behind card), .moon (breathing),
  .stars (twinkle), .hills (3 drifting SVG silhouettes), card with backdrop blur
  + rise animation. prefers-reduced-motion disables drift/twinkle/breath.

Page queue (breadth-first, from art-director-state.md):
1. BrandLogo (atmosphere mark) — DONE (committed earlier)
2. Main app shell ambient background + empty/loading copy (App.tsx) — DONE
 3. Login / account auth pages (standalone HTML) — DONE (account.html restyle 8b9a915)
 4. TitleBar / header (desktop renderer) — DONE this cycle
 5. Sidebar conversation list (desktop renderer) — DONE this cycle

Page queue status: ALL 5 breadth-first pages DONE. Light-theme token pass (bg-white/N ->
--brand-hover* across 16 renderer components) DONE this cycle (commit dc12919).

Next cycle options:
- Remaining light-mode gap: DiffViewer.tsx bg-white/5 (line 59) + hover:text-white (line 91).
- 3d_studio keeps an intentional sky/slate palette — leave as-is.
- If Playwright MCP becomes available, do a visual pass over all redesigned pages
  (none screenshot-verified yet — all art-director work so far is code-verified only).

Playwright MCP: NOT available this session (no mcp__playwright__* tools) — same as prior
art-director runs; proceed code-only and flag for a visual pass once MCP is attached.

Last verified: 2026-07-17
