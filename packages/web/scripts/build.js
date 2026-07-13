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

  // 3c. Copy the standalone account (change password) page
  fs.copyFileSync(path.join(webRoot, 'src/account.html'), path.join(distDir, 'account.html'));
  console.log('[Build] account.html copied.');

  // 4. Resolve and Copy CSS (use desktop index.css or built desktop/dist/index.css)
  const desktopBuiltCss = path.join(desktopRoot, 'dist/index.css');
  const desktopSrcCss = path.join(desktopRoot, 'src/index.css');
  const destCss = path.join(distDir, 'index.css');

  if (fs.existsSync(desktopBuiltCss)) {
    fs.copyFileSync(desktopBuiltCss, destCss);
    console.log('[Build] Copied compiled Tailwind CSS from desktop build.');
  } else if (fs.existsSync(desktopSrcCss)) {
    // If not compiled, copy raw CSS file as fallback
    fs.copyFileSync(desktopSrcCss, destCss);
    console.log('[Build] Copied raw index.css.');
  } else {
    // Write an empty CSS file if not found
    fs.writeFileSync(destCss, '/* Tailored CSS */');
    console.log('[Build] Created placeholder index.css.');
  }

  console.log('[Build] Complete build successful.');
}

build().catch((err) => {
  console.error('[Build] Compilation failed:', err);
  process.exit(1);
});
