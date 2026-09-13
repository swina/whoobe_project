import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  root: 'template',
  base: '/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        runtimeCaching: [
          {
            urlPattern: /\/public\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'whoobe-pages' },
          },
          {
            urlPattern: /\/dam-asset\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'whoobe-dam-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
      manifest: false,
    }),
  ],
})