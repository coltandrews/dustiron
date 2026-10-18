import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { open: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});
