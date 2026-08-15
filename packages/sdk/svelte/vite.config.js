import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve as resolvePath } from 'node:path'
import { existsSync } from 'node:fs'

// For vitest: the source files import each other with `.js` specifiers (the
// published dist files are `.js`), but the sources are `.ts` - Vite 5 doesn't
// map `.js` -> `.ts` by default, so this pre-resolve plugin does.
function jsToTs() {
  return {
    name: 'whoobe-js-to-ts',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.') || !source.endsWith('.js')) return
      const ts = resolvePath(resolvePath(importer, '..'), source.slice(0, -3) + '.ts')
      if (existsSync(ts)) return ts
    },
  }
}

// For vitest: SSR-renders the .svelte components via svelte/server's render() -
// no DOM/jsdom needed, matching the Vue adapter's SSR-test approach.
export default defineConfig({
  plugins: [jsToTs(), svelte()],
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', '**/.svelte-kit/**', '**/.{git,cache,output,temp}/**'],
  },
})
