import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import { registerSW } from './sw/service-worker'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/public/apps/:appId/:pathMatch(.*)*',
      component: () => import('./components/AppShell.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/public/apps/default/',
    },
  ],
})

const app = createApp(App)
app.use(router)
app.mount('#app')

registerSW()