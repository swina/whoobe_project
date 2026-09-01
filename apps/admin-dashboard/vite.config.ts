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
    allowedHosts: ["develop.local", "whoobe.example.com"]
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
