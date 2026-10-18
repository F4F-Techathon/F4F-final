import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The relay lives in the mobile app's server; DIRECTOR_TARGET points the console at another one (e.g. npm start on 3000).
const target = process.env.DIRECTOR_TARGET || 'http://localhost:5173'

// The stage test console: its own Vite app on 5174, reaching /api/stage/* through the app server. Built, it lives at
// /director/ of the same server as the app (server/app.ts), which also hands it the app's public files (shop data).
export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: command === 'build' ? '/director/' : '/',
  publicDir: fileURLToPath(new URL('../public', import.meta.url)),
  build: { outDir: 'dist', emptyOutDir: true, copyPublicDir: false },
  // A separate optimizer cache keeps two concurrent dev servers from invalidating each other.
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-director', import.meta.url)),
  plugins: [vue()],
  // `@` is the mobile app's src/, as in the app itself: the console draws with the same rigs, generator and Jev client.
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  server: {
    port: 5174,
    strictPort: true,
    // The proxy pipes the event stream as it arrives; the relay marks it no-cache, no-transform.
    proxy: {
      '/api': {
        target,
        changeOrigin: true,
        // When the app server dies mid-stream the proxy would keep the browser's stream open but silent;
        // dropping it lets the console notice and reconnect.
        configure: (proxy) => proxy.on('proxyRes', (proxyRes, _request, response) => {
          proxyRes.on('close', () => { if (!proxyRes.complete) response.destroy() })
        }),
      },
    },
  },
}))
