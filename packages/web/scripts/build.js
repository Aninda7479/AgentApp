import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const webRoot = path.resolve(__dirname, '..');
const distDir = path.join(webRoot, 'dist');
// All UI source now lives in packages/ui
const uiRoot = path.resolve(webRoot, '../ui');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const isWatch = process.argv.includes('--watch');

async function compileBundle(cfg) {
  if (isWatch) {
    const ctx = await esbuild.context(cfg);
    await ctx.watch();
    return ctx;
  } else {
    return await esbuild.build(cfg);
  }
}

async function build() {
  console.log('[Build] Starting web client compilation...');

  // 1. Build client-side IPC bridge
  await compileBundle({
    entryPoints: [path.join(webRoot, 'src/ipc-bridge.ts')],
    bundle: true,
    outfile: path.join(distDir, 'ipc-bridge.js'),
    format: 'iife',
    minify: process.env.NODE_ENV === 'production',
  });
  console.log('[Build] ipc-bridge.js compiled.');

  // 2. Build React SPA Client (entry point now in packages/ui)
  await compileBundle({
    entryPoints: [path.join(uiRoot, 'src/renderer/entry.tsx')],
    bundle: true,
    outfile: path.join(distDir, 'client.js'),
    format: 'iife',
    minify: !isWatch && process.env.NODE_ENV === 'production',
    sourcemap: isWatch || process.env.NODE_ENV !== 'production',
    alias: {
      '@lily-model': path.join(uiRoot, 'models/lily/index.ts'),
    },
    loader: {
      '.png': 'dataurl',
      '.svg': 'dataurl',
      '.woff': 'file',
      '.woff2': 'file',
      '.eot': 'file',
      '.ttf': 'file',
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(isWatch ? 'development' : (process.env.NODE_ENV || 'production')),
    },
  });
  console.log('[Build] React client.js compiled.');

  // 3. Copy index.html (from packages/web/src — web-specific shell HTML)
  fs.copyFileSync(path.join(webRoot, 'src/index.html'), path.join(distDir, 'index.html'));
  console.log('[Build] index.html copied.');

  // 3b. Copy the standalone login page
  fs.copyFileSync(path.join(webRoot, 'src/login.html'), path.join(distDir, 'login.html'));
  console.log('[Build] login.html copied.');

  // 3c. Build tray.js and copy tray.html (from packages/ui)
  const rendererDistDir = path.join(distDir, 'renderer');
  if (!fs.existsSync(rendererDistDir)) {
    fs.mkdirSync(rendererDistDir, { recursive: true });
  }
  await compileBundle({
    entryPoints: [path.join(uiRoot, 'src/renderer/trayCard/TrayCardApp.tsx')],
    bundle: true,
    outfile: path.join(rendererDistDir, 'tray.js'),
    format: 'iife',
    minify: !isWatch && process.env.NODE_ENV === 'production',
    alias: {
      '@lily-model': path.join(uiRoot, 'models/lily/index.ts'),
    },
    loader: {
      '.png': 'dataurl',
      '.svg': 'dataurl',
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(isWatch ? 'development' : (process.env.NODE_ENV || 'production')),
    },
  });
  console.log('[Build] renderer/tray.js compiled.');

  const uiTrayHtml = path.join(uiRoot, 'src/tray.html');
  if (fs.existsSync(uiTrayHtml)) {
    fs.copyFileSync(uiTrayHtml, path.join(distDir, 'tray.html'));
    console.log('[Build] tray.html copied.');
  }

  // 3d. Copy PWA Assets (manifest.json, sw.js, icon.png, icon.svg)
  fs.copyFileSync(path.join(webRoot, 'src/manifest.json'), path.join(distDir, 'manifest.json'));
  fs.copyFileSync(path.join(webRoot, 'src/sw.js'), path.join(distDir, 'sw.js'));
  fs.copyFileSync(path.join(webRoot, 'src/icon.png'), path.join(distDir, 'icon.png'));
  fs.copyFileSync(path.join(webRoot, 'src/icon.svg'), path.join(distDir, 'icon.svg'));

  // 4. Compile Tailwind CSS (source now in packages/ui/src/styles/)
  const uiSrcCss = path.join(uiRoot, 'src/styles/index.css');
  const uiBuiltCss = path.join(uiRoot, 'dist/index.css');
  const destCss = path.join(distDir, 'index.css');

  let compiled = false;
  try {
    const { execSync } = await import('child_process');
    console.log('[Build] Compiling Tailwind CSS for web client...');
    execSync(`npx @tailwindcss/cli -i "${uiSrcCss}" -o "${destCss}" ${isWatch ? '' : '--minify'}`, {
      cwd: uiRoot,
      stdio: 'inherit',
    });
    compiled = true;
    console.log('[Build] ✅ Tailwind CSS successfully compiled to dist/index.css.');
  } catch (err) {
    console.warn('[Build] ⚠️ Tailwind CLI compile error, checking for pre-built CSS:', err.message);
  }

  if (!compiled) {
    if (fs.existsSync(uiBuiltCss)) {
      fs.copyFileSync(uiBuiltCss, destCss);
      console.log('[Build] Copied pre-compiled Tailwind CSS from ui build.');
    } else if (fs.existsSync(uiSrcCss)) {
      fs.copyFileSync(uiSrcCss, destCss);
      console.warn('[Build] ⚠️ Copied raw index.css.');
    } else {
      fs.writeFileSync(destCss, '/* Tailored CSS */');
      console.log('[Build] Created placeholder index.css.');
    }
  }

  // 4b. Copy UI static assets to web dist
  const uiAssetsDir = path.join(uiRoot, 'assets');
  const webAssetsDir = path.join(distDir, 'assets');
  if (fs.existsSync(uiAssetsDir)) {
    fs.mkdirSync(webAssetsDir, { recursive: true });
    fs.cpSync(uiAssetsDir, webAssetsDir, { recursive: true });
    console.log('[Build] Copied ui static assets to web dist.');
  }

  console.log(`[Build] Complete build successful${isWatch ? ' (watching)' : ''}.`);
}

build().catch((err) => {
  console.error('[Build] Compilation failed:', err);
  process.exit(1);
});
