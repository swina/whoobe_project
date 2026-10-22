import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Inter ships with the dashboard (no request to a public host: it must work on a network with no route out)
import '@fontsource/inter/latin-300.css'
import '@fontsource/inter/latin-ext-300.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-ext-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-ext-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-ext-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/inter/latin-ext-700.css'
import { createBrowserLogger } from '@whoobe-cms/logger/browser'

const logger = createBrowserLogger('admin-dashboard')
window.__logger = logger

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
