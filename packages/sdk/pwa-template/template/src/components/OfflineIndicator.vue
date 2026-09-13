<template>
  <div v-if="!online" class="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-white px-4 py-1.5 rounded-full text-xs shadow-lg">
    You are offline
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const online = ref(navigator.onLine)

function onOnline() { online.value = true }
function onOffline() { online.value = false }

onMounted(() => {
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
})

onUnmounted(() => {
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
})
</script>