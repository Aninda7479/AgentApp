// Bundles the three Electron renderer entry points (main UI + 3D pet +
// circle-search) with esbuild.
//
// Why this exists: electron-builder only walks the MAIN process (main.js) require
// graph when deciding which node_modules files to ship. The renderer processes
// (ui.html -> entry.tsx, pet.html -> entry.ts, circle-search.html -> entry.tsx)
// load separately via BrowserWindow and are never traced, so renderer-only
// dependencies — notably three's `examples/jsm/*` addons (OrbitControls,
// GLTFLoader, RoomEnvironment, meshopt_decoder) — get pruned out of the asar and
// the renderer crashes on load (black screen). Bundling inlines every renderer
// dependency (react, three, the three addons, lucide-react, app source) into a
// single self-contained file under dist/, which electron-builder packages
// automatically. `electron` is kept external because the renderer reaches it
// only via the preload `contextBridge`, never via a static import.
//
// `format: 'iife'` (not 'cjs'): the HTML now loads the bundle with a plain
// <script src> tag (nodeIntegration is OFF), so there is no `require`/CommonJS
// host to evaluate a CJS bundle — an IIFE is self-executing.
//
// Output file name is `entry.bundle.js` (NOT `entry.js`): the project's `tsc`
// also compiles the renderer entry points and would emit a bare CommonJS
// `entry.js` into the same folder. If the two shared a name, `tsc -w` (run by
// `npm run dev`) would clobber the IIFE bundle on every save and the renderer
// would fail to boot (blank screen). Using a distinct name keeps the bundle
// owned exclusively by esbuild. Pass `--watch` to keep the bundles in sync with
// source changes during development.
import { build, context } from 'esbuild';

const WATCH = process.argv.includes('--watch');

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

// `context()` is required for `--watch` (esbuild removed the `watch` option from
// `build()` in 0.18). For a one-shot build we fall back to `build()` so the
// process exits cleanly (important for the `build` npm script).
async function bundle(cfg) {
  if (WATCH) {
    const ctx = await context(cfg);
    await ctx.watch();
  } else {
    await build(cfg);
  }
}

await bundle({
  ...common,
  entryPoints: ['src/renderer/entry.tsx'],
  outfile: 'dist/renderer/entry.bundle.js',
});

await bundle({
  ...common,
  entryPoints: ['src/pet/entry.ts'],
  outfile: 'dist/pet/entry.bundle.js',
});

await bundle({
  ...common,
  entryPoints: ['src/renderer/circle-search/entry.tsx'],
  outfile: 'dist/circle-search/entry.bundle.js',
});

console.log(
  `[bundle-renderer] renderer + pet + circle-search bundles built${
    WATCH ? ' (watching)' : ''
  }`
);
