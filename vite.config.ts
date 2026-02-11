import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

export default defineConfig({
  plugins: [svelte()],
  root: 'src/frontend',
  define: {
    DGRID_VERSION: JSON.stringify(pkg.version),
  },
  server: {
    port: parseInt(process.env.DGRID_FRONTEND_PORT || '5173', 10),
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.DGRID_PORT || '3001'}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../../dist/frontend',
    emptyOutDir: true,
  },
});
