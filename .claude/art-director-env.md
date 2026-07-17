# art-director environment notes

GUI location: React SPA shared by Electron desktop + web. Source in
`packages/desktop/src/renderer/` (App.tsx, theme.ts, BrandLogo.tsx, entry.tsx).
Web build compiles this renderer via esbuild into `packages/web/dist/client.js`
and serves it through `packages/web/src/server.ts`.

Dev server (for visual testing — ISOLATED instance, never the user's live one):
- Compile desktop Tailwind CSS first:
  `cd packages/desktop && npx @tailwindcss/cli -i src/index.css -o dist/index.css`
- Build web client + server:
  `cd packages/web && npm run build`  (build:client = esbuild, build:server = tsc)
- Serve on a SEPARATE port with auth disabled (do NOT use the user's running port):
  `cd packages/web && SUPERAGENT_DISABLE_AUTH=true PORT=3001 node dist/server.js`
- Confirm with: `curl -s http://localhost:3001/api/health` (expect {"ok":true})
  Do NOT screenshot just to confirm availability.

Design system facts:
- Tailwind v4 + CSS custom-property tokens (--brand-card, --brand-text-main,
  --brand-border-strong, --brand-text-muted, etc.) defined in
  `packages/desktop/src/index.css`.
- Theme modes: dark (default) / light / system. Hook in renderer/theme.ts.
- Icons: lucide-react (restyle/extend, never replace).
- Fonts: Inter (body) + Outfit (display), loaded in web/src/index.html.
- BrandLogo (`renderer/BrandLogo.tsx`) is the shared mark (desktop title bar, web
  SPA, login/account HTML). Currently a monochrome "A"/orbit glyph in a rounded
  square — prime candidate for the atmosphere motif.

Standalone auth pages (also need the atmosphere treatment):
- `packages/web/src/login.html`, `packages/web/src/account.html` (raw HTML, load
  `/index.css` + the brand mark inline).

Last verified: 2026-07-17
