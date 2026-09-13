import { ref } from 'vue'
import { getDB } from '../lib/push-provider'

const queue = ref<{ action: string; data: any; timestamp: number }[]>([])
const pendingCount = ref(0)

const DB_NAME = 'whoobe-offline-queue'
const STORE_NAME = 'mutations'

async function openDB() {
  const { openDB } = await import('idb')
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    },
  })
}

export function useOfflineSync() {
  async function enqueue(action: string, data: any) {
    const db = await openDB()
    await db.add(STORE_NAME, { action, data, timestamp: Date.now() })
    pendingCount.value++
  }

  async function processQueue() {
    if (!navigator.onLine) return
    const db = await openDB()
    const all = await db.getAll(STORE_NAME)
    for (const item of all) {
      try {
        await fetch(item.data.url, {
          method: item.data.method || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: item.data.body ? JSON.stringify(item.data.body) : undefined,
        })
        await db.delete(STORE_NAME, item.id)
        pendingCount.value--
      } catch {
        // Retry later
      }
    }
  }

  // Process queue when coming back online
  window.addEventListener('online', processQueue)

  return { enqueue, processQueue, pendingCount }
}