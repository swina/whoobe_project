import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Alpine from 'alpinejs'
import App from './App.vue'
import router from './router'
import './style.css'
import tailwindBrowserUrl from '@tailwindcss/browser?url'
import SearchElement from './components/SearchElement.vue'

// AlpineJS (docs/plans/cms/whoobe-one-spike-missing-features.md) - a real
// ESM import + Alpine.start(), not the reference's CDN-<script>-in-iframe-
// srcdoc approach (that mechanism doesn't apply here: this app has no
// iframe/static-export path, PublicPage.vue/DocumentPreview.vue render
// straight into the app's own live DOM - same reasoning as the Tailwind
// script injection just below, just as a normal import since Alpine is a
// real npm package, unlike @tailwindcss/browser). Safe to start
// unconditionally: the editing canvas (BlockElement.vue/BlockContainer.vue)
// never sets x-* attributes, only the preview tree
// (components/preview/*Preview.vue) does, so Alpine's own MutationObserver
// simply finds nothing to activate while the editor canvas is showing.
;(window as any).Alpine = Alpine
Alpine.start()

// @tailwindcss/browser is a self-executing script (not a real ES module -
// its package.json has no meaningful exports beyond the file itself), so
// it's loaded the same way Tailwind's own docs load it: a <script> tag,
// not a JS import. The `?url` suffix tells Vite to treat this as a plain
// static asset reference instead of trying to parse/bundle its contents -
// it resolves to a real, working URL in both dev and the production
// build, Vite just copies/hashes the file into dist/assets/ either way.
// Once the script tag loads, Tailwind's own runtime takes over: it scans
// the current DOM immediately, then keeps watching via a MutationObserver
// for as long as the page is open - no rebuild step, no @source
// declarations, works for genuinely any class, including arbitrary
// bracket values.
const tailwindScript = document.createElement('script')
tailwindScript.src = tailwindBrowserUrl
document.head.appendChild(tailwindScript)

// The "Search" palette element (ElementsClass.js Search()) renders as a
// live component rather than a native tag (search-element-plan) - the
// editing canvas, the preview tree and the public page all resolve
// `element === 'search'` to this same globally-registered component via
// BlockElement.vue/BlockElementPreview.vue's `component` computed.
const app = createApp(App)
app.component('SearchElement', SearchElement)
app.use(createPinia()).use(router).mount('#app')
