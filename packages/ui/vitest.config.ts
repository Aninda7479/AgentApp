process.env.VITE_CONFIG_NATIVE_IGNORE_WARNING = 'true';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['dist/**'],
    environment: 'jsdom',
    setupFiles: [fileURLToPath(new URL('./test/setup.ts', import.meta.url))],
  },
});
