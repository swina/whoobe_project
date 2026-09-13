export interface PushConfig {
  provider: 'self' | 'onesignal' | 'firebase'
  vapidPublicKey?: string
  onesignalAppId?: string
  firebaseApiKey?: string
  firebaseProjectId?: string
  firebaseSenderId?: string
  firebaseAppId?: string
}

export interface ClientPushResult {
  subscriptionId?: string
  error?: string
}

export async function subscribePush(config: PushConfig): Promise<string | null> {
  switch (config.provider) {
    case 'self':
      return subscribeSelf(config)
    case 'onesignal':
      return subscribeOneSignal(config)
    case 'firebase':
      return subscribeFirebase(config)
    default:
      console.error('Unknown push provider:', config.provider)
      return null
  }
}

async function subscribeSelf(config: PushConfig): Promise<string | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications not supported')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey!),
    })

    const json = subscription.toJSON()
    // Send subscription to server
    const response = await fetch('/pwa/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        websiteId: '__APP_ID__',
        provider: 'self',
        subscription: {
          endpoint: json.endpoint,
          keys: json.keys,
        },
      }),
    })

    if (response.ok) {
      const data = await response.json()
      return data.subscription?.id ?? json.endpoint
    }
    return null
  } catch (err) {
    console.error('Self push subscribe failed:', err)
    return null
  }
}

async function subscribeOneSignal(config: PushConfig): Promise<string | null> {
  if (!config.onesignalAppId) {
    console.error('OneSignal App ID required')
    return null
  }

  try {
    // OneSignal SDK is loaded from CDN via the service worker shim
    const OneSignal = (window as any).OneSignal
    if (OneSignal) {
      await OneSignal.init({ appId: config.onesignalAppId })
      const userId = await OneSignal.getUserId()
      return userId ?? null
    }

    // Fallback: load OneSignal SDK dynamically
    return await new Promise((resolve) => {
      const script = document.createElement('script')
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'
      script.async = true
      script.onload = async () => {
        const OneSignal = (window as any).OneSignal
        if (OneSignal) {
          await OneSignal.init({ appId: config.onesignalAppId })
          const userId = await OneSignal.getUserId()
          resolve(userId ?? null)
        } else {
          resolve(null)
        }
      }
      script.onerror = () => resolve(null)
      document.head.appendChild(script)
    })
  } catch {
    return null
  }
}

async function subscribeFirebase(config: PushConfig): Promise<string | null> {
  if (!config.firebaseApiKey || !config.firebaseProjectId || !config.firebaseSenderId) {
    console.error('Firebase config incomplete')
    return null
  }

  try {
    // Load Firebase SDK dynamically
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js')
    const { getMessaging, getToken } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging.js')

    const app = initializeApp({
      apiKey: config.firebaseApiKey,
      projectId: config.firebaseProjectId,
      messagingSenderId: config.firebaseSenderId,
      appId: config.firebaseAppId,
    })

    const messaging = getMessaging(app)
    const token = await getToken(messaging, {
      vapidKey: config.vapidPublicKey,
    })

    // Send FCM token to server
    const response = await fetch('/pwa/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        websiteId: '__APP_ID__',
        provider: 'firebase',
        subscription: {
          endpoint: `fcm:${token}`,
          keys: { fcmToken: token },
        },
      }),
    })

    if (response.ok) {
      const data = await response.json()
      return data.subscription?.id ?? token
    }
    return null
  } catch (err) {
    console.error('Firebase push subscribe failed:', err)
    return null
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw.split('').map((c) => c.charCodeAt(0)))
}