/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST || [])

registerRoute(
  ({ url }) => url.pathname.startsWith('/public/'),
  new StaleWhileRevalidate({ cacheName: 'whoobe-pages' })
)

registerRoute(
  ({ url }) => url.pathname.startsWith('/dam-asset/'),
  new CacheFirst({
    cacheName: 'whoobe-dam-images',
    plugins: [
      { cacheableResponse: { statuses: [0, 200] } },
      { expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 } },
    ],
  })
)

registerRoute(
  ({ url }) => url.pathname.startsWith('/public/objects/'),
  new StaleWhileRevalidate({ cacheName: 'whoobe-objects' })
)

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? { title: 'Whoobe', body: '' }
  const options: NotificationOptions = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    data: data.data,
  }
  event.waitUntil(self.registration.showNotification(data.title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(self.clients.openWindow(url))
})

export function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')
        console.log('SW registered:', registration.scope)
      } catch (err) {
        console.error('SW registration failed:', err)
      }
    })
  }
}