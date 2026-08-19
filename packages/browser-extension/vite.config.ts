import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: false,
    rollupOptions: {
      input: {
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'content-script': resolve(__dirname, 'src/content/content-script.ts'),
        'main-world': resolve(__dirname, 'src/content/main-world.ts'),
        sidepanel: resolve(__dirname, 'sidepanel/sidepanel.html'),
        popup: resolve(__dirname, 'popup/popup.html'),
        options: resolve(__dirname, 'options/options.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'service-worker') return 'service-worker.js';
          if (chunkInfo.name === 'content-script') return 'content-script.js';
          if (chunkInfo.name === 'main-world') return 'main-world.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  plugins: [
    {
      name: 'copy-extension-assets',
      closeBundle() {
        const distDir = resolve(__dirname, 'dist');
        if (!fs.existsSync(distDir)) {
          fs.mkdirSync(distDir, { recursive: true });
        }
        
        // Copy manifest.json
        const manifestSrc = resolve(__dirname, 'manifest.json');
        if (fs.existsSync(manifestSrc)) {
          fs.copyFileSync(manifestSrc, resolve(distDir, 'manifest.json'));
        }

        // Copy icons directory
        const iconsSrc = resolve(__dirname, 'icons');
        const iconsDist = resolve(distDir, 'icons');
        if (fs.existsSync(iconsSrc)) {
          if (!fs.existsSync(iconsDist)) {
            fs.mkdirSync(iconsDist, { recursive: true });
          }
          for (const file of fs.readdirSync(iconsSrc)) {
            fs.copyFileSync(resolve(iconsSrc, file), resolve(iconsDist, file));
          }
        }
      }
    }
  ]
});
