import { defineConfig } from 'vite';

// base: './' supaya hasil build jalan di GitHub Pages (subfolder repo) maupun root domain.
export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
});
