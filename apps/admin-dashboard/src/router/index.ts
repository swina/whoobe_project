import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import DashboardLayout from '../layouts/DashboardLayout.vue'
import OverviewView from '../views/OverviewView.vue'
import ObjectsView from '../views/ObjectsView.vue'
import AssetsView from '../views/AssetsView.vue'
import DocumentsView from '../views/DocumentsView.vue'
import PagesView from '../views/PagesView.vue'
import SettingsView from '../views/SettingsView.vue'
import ForgotPasswordView from '../views/ForgotPasswordView.vue'
import ResetPasswordView from '../views/ResetPasswordView.vue'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/forgot-password',
    name: 'ForgotPassword',
    component: ForgotPasswordView,
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    component: ResetPasswordView,
  },
  {
    path: '/',
    component: DashboardLayout,
    children: [
      {
        path: '',
        name: 'Overview',
        component: OverviewView,
        meta: { title: 'Dashboard Overview' }
      },
      {
        path: 'objects',
        name: 'Objects',
        component: ObjectsView,
        meta: { title: 'Data Objects' }
      },
      {
        path: 'assets',
        name: 'Assets',
        component: AssetsView,
        meta: { title: 'Asset Manager' }
      },
      {
        path: 'documents',
        name: 'Documents',
        component: DocumentsView,
        meta: { title: 'Documents & Pages' }
      },
      {
        path: 'pages',
        name: 'Pages',
        component: PagesView,
        meta: { title: 'Pages' }
      },
      {
        path: 'settings',
        name: 'Settings',
        component: SettingsView,
        meta: { title: 'System Settings' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  if (to.meta.title) {
    document.title = `${to.meta.title} | Admin Dashboard`
  }
  next()
})

export default router
