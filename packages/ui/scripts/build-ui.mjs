#!/usr/bin/env node
/**
 * SuperAgent UI — Build Script
 * Compiles Tailwind CSS, copies HTML and assets into dist/, bundles esbuild renderers,
 * and starts a local dev server on odd port 5173 when in watch/dev mode.
 */

import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const distDir = path.join(ROOT, 'dist');
const distAssetsDir = path.join(distDir, 'assets');
const srcAssetsDir = path.join(ROOT, 'assets');

const isWatch = process.argv.includes('--watch') || process.argv.includes('--serve') || process.argv.includes('dev');
const DEV_PORT = process.env.UI_DEV_PORT ? parseInt(process.env.UI_DEV_PORT, 10) : 5173;
const BACKEND_PORT = process.env.CORE_PORT ? parseInt(process.env.CORE_PORT, 10) : 1469;
const BACKEND_HOST = process.env.CORE_HOST || '127.0.0.1';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.vrm': 'model/gltf-binary',
};

// 1. Ensure dist directories exist
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(distAssetsDir, { recursive: true });

console.log('[build-ui] Preparing distribution directories...');

// 2. Compile Tailwind CSS
console.log('[build-ui] Compiling CSS...');
const srcCss = path.join(ROOT, 'src/styles/index.css');
const distCss = path.join(distDir, 'index.css');

function compileCss(watch = false) {
  if (watch) {
    try {
      const child = spawn('npx', ['@tailwindcss/cli', '-i', srcCss, '-o', distCss, '--watch'], {
        cwd: ROOT,
        stdio: 'inherit',
        shell: true,
      });
      child.on('error', (err) => console.warn('[build-ui] Tailwind watch error:', err.message));
    } catch (err) {
      console.warn('[build-ui] ⚠️ Failed to spawn Tailwind watch:', err.message);
    }
  } else {
    try {
      execSync(`npx @tailwindcss/cli -i "${srcCss}" -o "${distCss}" --minify`, {
        cwd: ROOT,
        stdio: 'inherit',
      });
      console.log('[build-ui] ✅ Tailwind CSS compiled successfully.');
    } catch (err) {
      console.warn('[build-ui] ⚠️ Tailwind CLI compile warning, falling back to direct CSS copy:', err.message);
      if (fs.existsSync(srcCss)) {
        fs.copyFileSync(srcCss, distCss);
        console.log('[build-ui] Copied raw src/styles/index.css to dist/index.css.');
      }
    }
  }
}

// 3. Copy HTML templates
const htmlFiles = [
  { src: 'src/index.html', dest: 'dist/index.html' },
  { src: 'src/ui.html', dest: 'dist/ui.html' },
  { src: 'src/login.html', dest: 'dist/login.html' },
  { src: 'src/pet.html', dest: 'dist/pet.html' },
  { src: 'src/circle-search.html', dest: 'dist/circle-search.html' },
  { src: 'src/tray.html', dest: 'dist/tray.html' },
  { src: 'src/overlay.html', dest: 'dist/overlay.html' },
];

function copyHtmlTemplates() {
  for (const { src, dest } of htmlFiles) {
    const srcPath = path.join(ROOT, src);
    const destPath = path.join(ROOT, dest);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`[build-ui] Copied ${src} -> ${dest}`);
    }
  }
}

// 4. Copy static assets if folder exists
function copyStaticAssets() {
  if (fs.existsSync(srcAssetsDir)) {
    try {
      fs.cpSync(srcAssetsDir, distAssetsDir, { recursive: true });
      console.log(`[build-ui] Copied static assets (including models) to dist/assets/`);
    } catch (err) {
      console.warn(`[build-ui] Static asset copy error:`, err.message);
    }
  }
}

// Run initial copies
copyHtmlTemplates();
copyStaticAssets();

// Dev server
function startDevServer(port = DEV_PORT) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://localhost:${port}`);
    let reqPath = decodeURIComponent(parsedUrl.pathname);

    // Forward API and WebSocket HTTP handshake requests to the core backend
    if (reqPath.startsWith('/api/') || reqPath === '/api' || reqPath.startsWith('/ws')) {
      const proxyReq = http.request(
        {
          host: BACKEND_HOST,
          port: BACKEND_PORT,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            host: `${BACKEND_HOST}:${BACKEND_PORT}`,
          },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );

      proxyReq.on('error', (err) => {
        console.warn(`[build-ui] Backend proxy error connecting to ${BACKEND_HOST}:${BACKEND_PORT}:`, err.message);
        if (!res.headersSent) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Backend Offline',
              message: `SuperAgent core backend is not running or unreachable on port ${BACKEND_PORT}.`,
            })
          );
        }
      });

      req.pipe(proxyReq);
      return;
    }

    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    let filePath = path.join(distDir, reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      const htmlCandidate = filePath + '.html';
      if (fs.existsSync(htmlCandidate)) {
        filePath = htmlCandidate;
      } else {
        filePath = path.join(distDir, 'index.html');
      }
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  });

  server.on('upgrade', (req, socket, head) => {
    const parsedUrl = new URL(req.url, `http://localhost:${port}`);
    if (parsedUrl.pathname.startsWith('/ws') || parsedUrl.pathname.startsWith('/api/ws')) {
      const proxySocket = net.connect(BACKEND_PORT, BACKEND_HOST, () => {
        proxySocket.write(
          `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
            Object.entries(req.headers)
              .map(([key, val]) => `${key}: ${val}`)
              .join('\r\n') +
            '\r\n\r\n'
        );
        if (head && head.length > 0) {
          proxySocket.write(head);
        }
        socket.pipe(proxySocket).pipe(socket);
      });

      proxySocket.on('error', (err) => {
        console.warn('[build-ui] WS proxy error:', err.message);
        socket.destroy();
      });
    } else {
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`[build-ui] 🚀 SuperAgent UI Dev Server listening on http://localhost:${port}`);
  });
  return server;
}

function syncDist() {
  const syncTargets = [
    path.resolve(ROOT, '../desktop/dist'),
    path.resolve(ROOT, '../core_v2/ui-dist'),
  ];
  for (const target of syncTargets) {
    try {
      fs.mkdirSync(target, { recursive: true });
      fs.cpSync(distDir, target, { recursive: true });
      console.log(`[build-ui] ✅ Synced UI assets -> ${path.relative(ROOT, target)}`);
    } catch {}
  }
}

// 6. Bundle esbuild renderers
console.log('[build-ui] Running esbuild bundle-renderer...');
const bundleScript = path.join(__dirname, 'bundle-renderer.mjs');

if (isWatch) {
  compileCss(true);

  const child = spawn(process.execPath, [bundleScript, '--watch'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  child.on('error', (err) => console.error('[build-ui] esbuild watch error:', err));

  syncDist();
  startDevServer(DEV_PORT);
} else {
  compileCss(false);

  execSync(`"${process.execPath}" "${bundleScript}"`, {
    cwd: ROOT,
    stdio: 'inherit',
  });

  syncDist();
  console.log('[build-ui] ✅ UI build finished.');
}


