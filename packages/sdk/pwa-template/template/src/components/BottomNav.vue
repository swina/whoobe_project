<template>
  <div class="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t"
    :class="[config.backgroundColor || 'bg-white', 'border-gray-200']"
    style="padding-bottom: env(safe-area-inset-bottom, 0px);">
    <button
      v-for="item in config.items"
      :key="item.id"
      class="flex flex-col items-center gap-0.5 py-1.5 px-3 text-[10px] font-medium transition-colors"
      :class="item.active ? (config.activeColor || 'text-indigo-600') : (config.inactiveColor || 'text-gray-500')"
      @click="onNavigate(item)"
    >
      <LucideIcon :name="item.icon" class="w-5 h-5" />
      <span>{{ item.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ElementBottomNav } from '@whoobe-cms/schema'
import { useRouter } from 'vue-router'

const props = defineProps<{ config: ElementBottomNav }>()
const router = useRouter()

function onNavigate(item: { link: string; id: string }) {
  if (item.link) {
    router.push(item.link)
  }
}
</script>