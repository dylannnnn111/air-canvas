import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages under /<repo>/ without config.
export default defineConfig({
  base: './',
  server: { host: true },
});
