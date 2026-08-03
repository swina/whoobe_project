import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import tailwindBrowserUrl from '@tailwindcss/browser?url'

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

createApp(App).use(createPinia()).use(router).mount('#app')
