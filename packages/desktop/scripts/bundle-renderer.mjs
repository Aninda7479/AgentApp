// Bundles the three Electron renderer entry points (main UI + 3D pet +
// circle-search) with esbuild.
//
// Why this exists: electron-builder only walks the MAIN process (main.js) require
// graph when deciding which node_modules files to ship. The renderer processes
// (ui.html -> entry.tsx, pet.html -> entry.ts) load separately via BrowserWindow
// and are never traced, so renderer-only dependencies — notably three's
// `examples/jsm/*` addons (OrbitControls, GLTFLoader, RoomEnvironment,
// meshopt_decoder) — get pruned out of the asar and the renderer crashes on load
// (black screen). Bundling inlines every renderer dependency (react, three, the
// three addons, lucide-react, app source) into a single self-contained file under
// dist/, which electron-builder packages automatically. `electron` is kept
// external because the renderer reaches it only via the preload `contextBridge`,
// never via a static import.
//
// `format: 'iife'` (not 'cjs'): the HTML now loads the bundle with a plain
// <script src> tag (nodeIntegration is OFF), so there is no `require`/CommonJS
// host to evaluate a CJS bundle — an IIFE is self-executing.
import { build } from 'esbuild';

const common = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  target: 'es2020',
  external: ['electron'],
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'empty' },
  logLevel: 'info',
  metafile: true,
};

await build({
  ...common,
  entryPoints: ['src/renderer/entry.tsx'],
  outfile: 'dist/renderer/entry.js',
});

await build({
  ...common,
  entryPoints: ['src/pet/entry.ts'],
  outfile: 'dist/pet/entry.js',
});

await build({
  ...common,
  entryPoints: ['src/renderer/circle-search/entry.tsx'],
  outfile: 'dist/circle-search/entry.js',
});

console.log('[bundle-renderer] renderer + pet + circle-search bundles built');
