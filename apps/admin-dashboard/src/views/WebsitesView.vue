<template>
  <div class="h-full overflow-y-auto">
    <div class="max-w-4xl space-y-6">
      <div>
        <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">Websites</h2>
        <p class="text-xs text-slate-400 light:text-slate-600">Manage websites, their settings, and URL path trees</p>
      </div>

      <WebsiteSettingsCard />
    </div>
  </div>
</template>

<script setup lang="ts">
import WebsiteSettingsCard from '../components/settings/WebsiteSettingsCard.vue'
</script>