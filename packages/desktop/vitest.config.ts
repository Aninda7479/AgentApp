import { defineConfig } from 'vitest/config';

// Restrict the test runner to the TypeScript sources. Without this, vitest's
// default glob also matches compiled `dist/**/*.test.js` (CommonJS), which
// fails to load under vitest's ESM and produces spurious "Failed Suites".
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: ['dist/**', 'node_modules/**'],
    environment: 'node'
  }
});
