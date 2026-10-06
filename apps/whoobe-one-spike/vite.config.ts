import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { loadRootEnv } from '@whoobe-cms/core/server'

// vite.config.ts is evaluated by Node directly, before Vite's own env
// pipeline runs - `envDir` below only wires up `import.meta.env.VITE_*`
// for CLIENT code, it does NOT populate `process.env` for reads made
// here in the config file itself (see `base` below). Load the repo-root
// .env explicitly so process.env.VITE_BASE_URL is actually set by the
// time `base` is computed.
loadRootEnv()

// No @tailwindcss/vite plugin here - Tailwind runs entirely at runtime, in
// the browser, via @tailwindcss/browser (see main.ts). That's a deliberate
// architecture change, not a missing dependency: the build-time pipeline
// can only ever generate CSS for classes it can find literally written
// out in source files (or explicitly declared via @source inline()) -
// which silently broke for the Tailwind customizer's own structured
// controls (see the CustomClassesControl.vue investigation in this app's
// README) and can *never* work at all for genuinely arbitrary bracket-
// value classes (`p-[12px]`) typed into a live, running app - there's no
// finite list to pre-declare for "any value a user might ever type". The
// runtime engine watches the live DOM directly and generates real CSS for
// whatever classes actually appear, immediately, with no such limitation.
// Dev server only: silence the "externalized for browser compatibility" warnings caused by postcss (pulled in by
// sanitize-html, see src/node-builtin-stub.ts). Production builds are untouched.
const devOnlyNodeStubs = (command: string) =>
  command === 'serve'
    ? [{ find: /^(fs|path|url|source-map-js)$/, replacement: fileURLToPath(new URL('./src/node-builtin-stub.ts', import.meta.url)) }]
    : []

export default defineConfig(({ command }) => ({
  resolve: { alias: devOnlyNodeStubs(command) },
  base: process.env.VITE_BASE_URL || '/',
  // Single source of truth for env vars: the repo-root .env (see
  // docs/plans/environment/env-optimization.md). Vite natively expands
  // ${VAR} references (dotenv-expand) and shell-exported vars win.
  envDir: '../../',
  plugins: [vue()],
  // dragula's own dependency chain (crossvent -> custom-event) references
  // Node's `global` object directly, assuming a bundler that polyfills it
  // (Webpack did this automatically; Vite/esbuild does not). Aliasing it to
  // `globalThis` is the standard fix for this class of legacy-CommonJS-
  // package error under Vite.
  define: {
    global: 'globalThis'
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3006,
    allowedHosts: true
  }
}))
