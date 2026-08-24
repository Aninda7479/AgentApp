import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^(\.\.\/src|\.\/src|\.\.)\/renderer\/(.*)/, replacement: resolve(__dirname, '../ui/src/renderer/$2') },
      { find: /^\.\/renderer\/(.*)/, replacement: resolve(__dirname, '../ui/src/renderer/$1') },
      { find: /^(\.\.\/models|\.\/models|models)\/lily\/(.*)/, replacement: resolve(__dirname, '../ui/models/lily/$2') },
      { find: '../models/lily/index', replacement: resolve(__dirname, '../ui/models/lily/index.ts') },
      { find: '@lily-model', replacement: resolve(__dirname, '../ui/models/lily/index.ts') },
      { find: '@superagent/ui', replacement: resolve(__dirname, '../ui/src') }
    ]
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: [
      'dist/**',
      'node_modules/**',
      'test/ai-engine.test.ts',
      'test/artifact_manager.test.ts',
      'test/desktop-send-message-e2e.test.ts',
      'test/desktop_gateway.test.ts',
      'test/gateway-whatsapp.test.ts',
      'test/partner-window.test.ts',
      'test/pet-geometry.test.ts',
      'test/storage.test.ts'
    ],
    environment: 'jsdom'
  }
});

