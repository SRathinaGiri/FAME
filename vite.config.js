import { defineConfig } from 'vite';

// Native app builds (Android / Windows) load from the app bundle, so asset paths are relative.
const base = process.env.FAME_NATIVE
  ? './'
  : process.env.GITHUB_PAGES === 'true' ? '/FAME/' : '/';

export default defineConfig({
  base,
  build: process.env.FAME_OUT_DIR ? { outDir: process.env.FAME_OUT_DIR, emptyOutDir: true } : undefined,
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm']
  }
});
