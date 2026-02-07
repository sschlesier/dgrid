import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ['browser'],
  },
  test: {
    globals: true,
    exclude: ['node_modules', 'dist', 'tests/e2e/**'],
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts', '@testing-library/svelte/vitest'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts', '**/__tests__/**'],
    },
  },
});
