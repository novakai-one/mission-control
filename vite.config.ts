import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendPort = process.env.NOVAKAI_BACKEND_PORT || '3031';

export default defineConfig({
  plugins: [react()],
  root: 'src/frontend',
  build: {
    outDir: '../../dist/frontend',
    emptyOutDir: true,
  },
  server: {
    port: 3030,
    host: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true
      },
      '/ws': {
        target: `ws://127.0.0.1:${backendPort}`,
        ws: true
      }
    }
  },
});
