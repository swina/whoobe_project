<template>
  <div class="h-full flex flex-col">
    <SplashScreen v-if="loading" />
    <template v-else>
      <div class="flex-1 overflow-y-auto pb-16">
        <div v-if="pageTree" class="whoobe-renderer">
          <WhoobePage :descriptor="pageTree" />
        </div>
        <div v-else class="flex items-center justify-center h-full text-gray-400">
          No content available
        </div>
      </div>
      <BottomNav v-if="bottomNavConfig" :config="bottomNavConfig" />
    </template>
    <OfflineIndicator />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAppData } from '../composables/useAppData'
import { usePushNotifications } from '../composables/usePushNotifications'
import SplashScreen from './SplashScreen.vue'
import BottomNav from './BottomNav.vue'
import OfflineIndicator from './OfflineIndicator.vue'

const route = useRoute()
const appId = route.params.appId as string
const loading = ref(true)
const pageTree = ref<any>(null)
const bottomNavConfig = ref<any>(null)

onMounted(async () => {
  try {
    const { website, pwaConfig, pages, paths } = await useAppData(appId)

    // Apply PWA config to meta tags
    const themeColor = (pwaConfig as any)?.themeColor
    if (themeColor) {
      document.getElementById('theme-color')?.setAttribute('content', themeColor)
    }
    document.title = (pwaConfig as any)?.shortName ?? website.name

    // Find bottom navigation from pages content
    for (const page of pages) {
      const tree = page.content as any
      if (tree?.bottomNav) {
        bottomNavConfig.value = tree.bottomNav
      }
    }

    // Use the first page as entry tree
    if (pages.length > 0) {
      pageTree.value = pages[0].content
    }

    // Initialize push notifications
    const pushConfig = (pwaConfig as any)?.push
    if (pushConfig) {
      usePushNotifications(pushConfig)
    }
  } catch (err) {
    console.error('Failed to load app data:', err)
  } finally {
    loading.value = false
  }
})
</script>