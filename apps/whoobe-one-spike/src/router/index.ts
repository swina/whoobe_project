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

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'Main', component: Main },
    { path: '/editor', name: 'Editor', component: Editor },
  ],
})

export default router
