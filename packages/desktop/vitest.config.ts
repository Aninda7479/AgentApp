import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@lily-model': resolve(__dirname, 'models/lily/index.ts')
    }
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

