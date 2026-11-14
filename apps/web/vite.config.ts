import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API runs on :3000. In dev, /api/* is proxied there with the prefix stripped, so the browser
// only ever talks to the Vite origin (no CORS, and EventSource works without credentials).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
