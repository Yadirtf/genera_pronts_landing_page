import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo, /api se redirige al servidor local (server/index.ts).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Puerto fijo: si cambiara (5174…), el navegador vería otra web y otros datos guardados.
    strictPort: true,
    // El banco en disco no es código: que guardar una landing no recargue la página.
    watch: { ignored: ['**/data/**'] },
    proxy: { '/api': `http://127.0.0.1:${process.env.PORT || 8787}` },
  },
});
