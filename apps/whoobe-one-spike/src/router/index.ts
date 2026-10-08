// Port of whoobe-one-studio's router/index.js to Vue Router 4 (port plan §2
// item 5): `new VueRouter({ mode: 'history', ... })` -> `createRouter({
// history: createWebHistory(...), ... })`; `Vue.use(VueRouter)` is gone
// entirely in Vue 3 (the router is installed via `app.use(router)` in
// main.ts instead, not a global Vue.use() call).
//
// The source also monkey-patches `VueRouter.prototype.push` to swallow
// `NavigationDuplicated` errors - `VueRouter` is a factory function in
// Vue Router 4, not a constructor with a prototype to patch the same way,
// and isn't needed here regardless: Vue Router 4's `router.push()` already
// resolves (doesn't throw) for duplicate/aborted navigations by default.
//
// Only one real route existed in the source (everything else was already
// commented out - Help, Templates, Preview, etc., all Phase 3+ views). This
// adds one more, `/editor`, that wasn't active in the source's own router
// either (the Editor was reached some other way, not through routing) -
// added here specifically so this router actually demonstrates real
// navigation (a single static route proves nothing about Vue Router 4
// working end-to-end).
import { createRouter, createWebHistory } from 'vue-router'
import Main from '../views/Main.vue'
import Editor from '../views/Editor.vue'
import { chooseHistoryBase } from './history-base'

const router = createRouter({
  history: createWebHistory(chooseHistoryBase(window.location.pathname, import.meta.env.BASE_URL)),
  routes: [
    { path: '/', name: 'Main', component: Main },
    { path: '/editor', name: 'Editor', component: Editor },
    // Standalone preview view — opened inside an iframe by
    // DocumentPreview.vue for responsive device previews. Reads the
    // serialized document from sessionStorage.
    { path: '/preview', name: 'Preview', component: () => import('../views/PreviewView.vue') },
    // Website search (search-engine plan Phase 4): real search over the
    // headless /public/search endpoint, no catch-all interplay - registered
    // before it so "search" is never treated as a page slug.
    { path: '/search', name: 'Search', component: () => import('../views/SearchResultsView.vue') },
    // (SiteEntry shows the documentation layout for the root path of a documentation website, PublicPage for everything else.)
    // Catch-all, always last - an exact match above always wins regardless
    // of array position, so this only ever matches something neither of
    // those two are. Renders a real page by its stored slug/dynamic-
    // pattern via the public API - see docs/plans/website/website-paths.md
    // and PublicPage.vue's own header comment. This is what a list-to-
    // detail link (BlockContainerPreview.vue's childHref()) opens in a new
    // tab to.
    { path: '/:pathMatch(.*)*', name: 'PublicPage', component: () => import('../views/SiteEntry.vue') },
  ],
})

export default router
