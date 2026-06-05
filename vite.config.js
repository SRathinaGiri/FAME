import { defineConfig } from 'vite';

const base = process.env.GITHUB_PAGES === 'true' ? '/FAME/' : '/';

export default defineConfig({
  base,
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
