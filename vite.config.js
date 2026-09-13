import { defineConfig } from 'vite';

// Server dikonfigurasi agar bisa diakses dari host preview (bukan hanya localhost).
export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
