// Bundles the desktop renderer entry points (main UI + 3D pet +
// circle-search + tray card) with esbuild.
//
// Bundling inlines renderer dependencies (react, three, lucide-react, app source)
// into self-contained IIFE files under dist/.
//
// Pass `--watch` to keep the bundles in sync with source changes during development.
import { build, context } from 'esbuild';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const WATCH = process.argv.includes('--watch');

const common = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  target: 'es2020',
  alias: {
    // Allow renderer code to import the Lily 3D model from models/ which lives
    // outside src/. esbuild resolves the alias before any other resolver.
    '@lily-model': resolve(ROOT, 'models/lily/index.ts')
  },
  define: {
    'process.env.NODE_ENV': WATCH ? '"development"' : '"production"',
  },
  loader: { '.css': 'empty' },
  logLevel: 'info',
  metafile: true,
  minify: !WATCH,
  treeShaking: true,
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

await bundle({
  ...common,
  entryPoints: ['src/renderer/trayCard/TrayCardApp.tsx'],
  outfile: 'dist/renderer/tray.js',
});

console.log(
  `[bundle-renderer] renderer + pet + circle-search + tray bundles built${
    WATCH ? ' (watching)' : ''
  }`
);
