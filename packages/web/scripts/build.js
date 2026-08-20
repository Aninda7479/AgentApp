import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const webRoot = path.resolve(__dirname, '..');
const distDir = path.join(webRoot, 'dist');
const desktopRoot = path.resolve(webRoot, '../desktop');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

async function build() {
  console.log('[Build] Starting web client compilation...');

  // 1. Build client-side IPC bridge
  await esbuild.build({
    entryPoints: [path.join(webRoot, 'src/ipc-bridge.ts')],
    bundle: true,
    outfile: path.join(distDir, 'ipc-bridge.js'),
    format: 'iife',
    minify: process.env.NODE_ENV === 'production',
  });
  console.log('[Build] ipc-bridge.js compiled.');

  // 2. Build React SPA Client
  await esbuild.build({
    entryPoints: [path.join(desktopRoot, 'src/renderer/entry.tsx')],
    bundle: true,
    outfile: path.join(distDir, 'client.js'),
    format: 'iife',
    minify: process.env.NODE_ENV === 'production',
    sourcemap: process.env.NODE_ENV !== 'production',
    loader: {
      '.png': 'dataurl',
      '.svg': 'dataurl',
      '.woff': 'file',
      '.woff2': 'file',
      '.eot': 'file',
      '.ttf': 'file',
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    },
  });
  console.log('[Build] React client.js compiled.');

  // 3. Copy index.html
  fs.copyFileSync(path.join(webRoot, 'src/index.html'), path.join(distDir, 'index.html'));
  console.log('[Build] index.html copied.');

  // 3b. Copy the standalone login page
  fs.copyFileSync(path.join(webRoot, 'src/login.html'), path.join(distDir, 'login.html'));
  console.log('[Build] login.html copied.');


  // 3c-2. Build tray.js and copy tray.html for Artifacts tray popup
  const rendererDistDir = path.join(distDir, 'renderer');
  if (!fs.existsSync(rendererDistDir)) {
    fs.mkdirSync(rendererDistDir, { recursive: true });
  }
  await esbuild.build({
    entryPoints: [path.join(desktopRoot, 'src/renderer/trayCard/TrayCardApp.tsx')],
    bundle: true,
    outfile: path.join(rendererDistDir, 'tray.js'),
    format: 'iife',
    minify: process.env.NODE_ENV === 'production',
    loader: {
      '.png': 'dataurl',
      '.svg': 'dataurl',
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    },
  });
  console.log('[Build] renderer/tray.js compiled.');
  fs.copyFileSync(path.join(desktopRoot, 'src/tray.html'), path.join(distDir, 'tray.html'));
  console.log('[Build] tray.html copied.');

  // 3d. Copy PWA Assets (manifest.json, sw.js, icon.png, icon.svg)
  fs.copyFileSync(path.join(webRoot, 'src/manifest.json'), path.join(distDir, 'manifest.json'));
  fs.copyFileSync(path.join(webRoot, 'src/sw.js'), path.join(distDir, 'sw.js'));
  fs.copyFileSync(path.join(webRoot, 'src/icon.png'), path.join(distDir, 'icon.png'));
  fs.copyFileSync(path.join(webRoot, 'src/icon.svg'), path.join(distDir, 'icon.svg'));
  // 4. Resolve and Compile Tailwind CSS
  const desktopBuiltCss = path.join(desktopRoot, 'dist/index.css');
  const desktopSrcCss = path.join(desktopRoot, 'src/index.css');
  const destCss = path.join(distDir, 'index.css');

  let compiled = false;
  try {
    const { execSync } = await import('child_process');
    console.log('[Build] Compiling Tailwind CSS for web client...');
    execSync(`npx @tailwindcss/cli -i "${desktopSrcCss}" -o "${destCss}" --minify`, {
      cwd: desktopRoot,
      stdio: 'inherit',
    });
    compiled = true;
    console.log('[Build] ✅ Tailwind CSS successfully compiled to dist/index.css.');
  } catch (err) {
    console.warn('[Build] ⚠️ Tailwind CLI compile error, checking for pre-built CSS:', err.message);
  }

  if (!compiled) {
    if (fs.existsSync(desktopBuiltCss)) {
      fs.copyFileSync(desktopBuiltCss, destCss);
      console.log('[Build] Copied pre-compiled Tailwind CSS from desktop build.');
    } else if (fs.existsSync(desktopSrcCss)) {
      fs.copyFileSync(desktopSrcCss, destCss);
      console.warn('[Build] ⚠️ Copied raw index.css.');
    } else {
      fs.writeFileSync(destCss, '/* Tailored CSS */');
      console.log('[Build] Created placeholder index.css.');
    }
  }

  // 4b. Copy desktop static assets to web dist
  const desktopAssetsDir = path.join(desktopRoot, 'assets');
  const webAssetsDir = path.join(distDir, 'assets');
  if (fs.existsSync(desktopAssetsDir)) {
    fs.mkdirSync(webAssetsDir, { recursive: true });
    fs.cpSync(desktopAssetsDir, webAssetsDir, { recursive: true });
    console.log('[Build] Copied desktop static assets to web dist.');
  }

  console.log('[Build] Complete build successful.');
}

build().catch((err) => {
  console.error('[Build] Compilation failed:', err);
  process.exit(1);
});
