import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import vuetify from 'vite-plugin-vuetify';

export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  server: {
    // host: true so the dev server is reachable from outside the Docker container.
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        // In Docker Compose the API is reachable at http://api:3000.
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
