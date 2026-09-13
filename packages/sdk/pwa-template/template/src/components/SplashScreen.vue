<template>
  <div v-if="show" class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
    <div class="w-16 h-16 mb-4 rounded-2xl shadow-lg" :style="{ backgroundColor: themeColor }"></div>
    <h1 class="text-xl font-semibold text-gray-800">{{ appName }}</h1>
    <div class="mt-8">
      <div class="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = withDefaults(defineProps<{ duration?: number }>(), { duration: 1500 })
const show = ref(true)
const themeColor = ref('#4f46e5')
const appName = ref('Whoobe')

onMounted(() => {
  setTimeout(() => { show.value = false }, props.duration)
})
</script>