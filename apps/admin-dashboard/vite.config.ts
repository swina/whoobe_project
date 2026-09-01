import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  // Single source of truth for env vars: the repo-root .env (see
  // docs/plans/environment/env-optimization.md). Vite natively expands
  // ${VAR} references (dotenv-expand) and shell-exported vars win, which
  // is how ./dev-cms.sh --hostname overrides WHOOBE_HOSTNAME per run.
  envDir: '../../',
  plugins: [
    vue(),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/auth': { target: 'http://develop.local:3003', changeOrigin: true },
      '/whoobe-one': { target: 'http://develop.local:3003', changeOrigin: true },
      '/documents': { target: 'http://develop.local:3003', changeOrigin: true },
      '/snippets': { target: 'http://develop.local:3003', changeOrigin: true },
      '/data-classes': { target: 'http://develop.local:3003', changeOrigin: true },
      '/data-components': { target: 'http://develop.local:3003', changeOrigin: true },
      '/data-objects': { target: 'http://develop.local:3003', changeOrigin: true },
      '/mail-settings': { target: 'http://develop.local:3003', changeOrigin: true },
      '/mail-log': { target: 'http://develop.local:3003', changeOrigin: true },
      '/mail-templates': { target: 'http://develop.local:3003', changeOrigin: true },
      '/migration-sources': { target: 'http://develop.local:3003', changeOrigin: true },
      '/health': { target: 'http://develop.local:3003', changeOrigin: true },
      '/search': { target: 'http://develop.local:3003', changeOrigin: true },
      '/themes': { target: 'http://develop.local:3003', changeOrigin: true },
      '/api/v1/dam': { target: 'http://develop.local:3002', changeOrigin: true },
      // whoobe-one-spike editor (port 3006) — proxy strips the prefix so
      // the editor app at `/` receives the clean path.
      '/whoobe-one-editor': {
        target: 'http://develop.local:3006',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/whoobe-one-editor/, ''),
      },
      // whoobe-studio (port 3004) — same proxying approach.
      '/whoobe-studio': {
        target: 'http://develop.local:3004',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/whoobe-studio/, ''),
      },
    },
  },
  optimizeDeps: {
    exclude: ['sharp']
  },
  build: {
    rollupOptions: {
      external: ['sharp']
    }
  }
})
