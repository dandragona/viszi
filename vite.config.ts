import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@model': resolve(__dirname, 'src/model'),
      '@web': resolve(__dirname, 'src/web'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4321',
    },
  },
});
