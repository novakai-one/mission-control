import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
        target: 'http://127.0.0.1:3031',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://127.0.0.1:3031',
        ws: true
      }
    }
  },
});
