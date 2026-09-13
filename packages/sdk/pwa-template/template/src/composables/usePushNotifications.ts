import { ref } from 'vue'
import type { PushConfig } from '../lib/push-provider'

const subscribed = ref(false)
const subscriptionId = ref<string | null>(null)

export function usePushNotifications(config: PushConfig) {
  async function subscribe(): Promise<boolean> {
    try {
      const { subscribePush } = await import('../lib/push-provider')
      const result = await subscribePush(config)
      if (result) {
        subscribed.value = true
        subscriptionId.value = result
      }
      return !!result
    } catch (err) {
      console.error('Push subscribe failed:', err)
      return false
    }
  }

  async function unsubscribe(): Promise<void> {
    subscriptionId.value = null
    subscribed.value = false
  }

  return { subscribe, unsubscribe, subscribed, subscriptionId }
}