<template>
  <div v-if="authStore.isLoading" class="min-h-screen bg-slate-950 light:bg-slate-50 flex items-center justify-center">
    <span class="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full"></span>
  </div>
  <LoginView v-else-if="!authStore.currentUser" />
  <router-view v-else />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from './stores/authStore'
import LoginView from './views/LoginView.vue'

const authStore = useAuthStore()

onMounted(() => {
  authStore.fetchMe()
})
</script>
