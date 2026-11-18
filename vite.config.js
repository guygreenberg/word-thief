import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `npm run dev:https` serves over HTTPS so phones on the LAN can use the camera.
export default defineConfig(({ mode }) => ({
  root: 'client',
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    host: true,
    port: 5173,
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
}));
