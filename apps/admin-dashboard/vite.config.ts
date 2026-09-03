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
      '/auth': { target: 'http://localhost:3003', changeOrigin: true },
      '/whoobe-one': { target: 'http://localhost:3003', changeOrigin: true },
      '/documents': { target: 'http://localhost:3003', changeOrigin: true },
      '/snippets': { target: 'http://localhost:3003', changeOrigin: true },
      '/data-classes': { target: 'http://localhost:3003', changeOrigin: true },
      '/data-components': { target: 'http://localhost:3003', changeOrigin: true },
      '/data-objects': { target: 'http://localhost:3003', changeOrigin: true },
      '/mail-settings': { target: 'http://localhost:3003', changeOrigin: true },
      '/mail-log': { target: 'http://localhost:3003', changeOrigin: true },
      '/mail-templates': { target: 'http://localhost:3003', changeOrigin: true },
      '/migration-sources': { target: 'http://localhost:3003', changeOrigin: true },
      '/health': { target: 'http://localhost:3003', changeOrigin: true },
      '/search': { target: 'http://localhost:3003', changeOrigin: true },
      '/themes': { target: 'http://localhost:3003', changeOrigin: true },
      '/public': { target: 'http://localhost:3003', changeOrigin: true },
      '/ai': { target: 'http://localhost:3003', changeOrigin: true },
      '/figma': { target: 'http://localhost:3003', changeOrigin: true },
      '/api/v1/dam': { target: 'http://localhost:3002', changeOrigin: true },
      // whoobe-studio (port 3004) — same proxying approach.
      '/whoobe-studio': {
        target: 'http://localhost:3004',
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
