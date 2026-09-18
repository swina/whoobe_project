import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import { createBrowserLogger } from '@whoobe-cms/logger/browser'

const logger = createBrowserLogger('admin-dashboard')
window.__logger = logger

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
