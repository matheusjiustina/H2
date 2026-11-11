import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Inline empty PostCSS config so Vite never picks up the parent folder's (store site) postcss.config.mjs.
  css: { postcss: { plugins: [] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  server: { host: true },
});
