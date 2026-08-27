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
      'node_modules/**'
    ],
    environment: 'jsdom'
  }
});

