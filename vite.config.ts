import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev lane: vite serves 3130 and proxies to the dev backend. One canonical
// backend-port variable everywhere: NOVAKAI_SERVER_PORT (the Live lane keeps
// 3030/3031 via tools/deploy.mjs and never goes through vite).
const backendPort = process.env.NOVAKAI_SERVER_PORT || '3131';

export default defineConfig({
  plugins: [react()],
  root: 'src/frontend',
  build: {
    outDir: '../../dist/frontend',
    emptyOutDir: true,
  },
  server: {
    port: 3130,
    // Never drift onto a neighboring port (3131 is the dev backend) — fail loud.
    strictPort: true,
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
