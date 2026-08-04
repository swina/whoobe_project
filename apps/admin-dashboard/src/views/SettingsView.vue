<template>
  <div class="space-y-6 max-w-4xl">
    <div>
      <h2 class="text-xl font-bold text-slate-100">System Settings</h2>
      <p class="text-xs text-slate-400">Configure DAM S3/MinIO storage, folder visibility rules, workspace, and sync options.</p>
    </div>

    <!-- DAM Storage Manager -->
    <DamConfigManager />

    <!-- Security: two-factor authentication -->
    <MfaSettingsCard />

    <!-- General Options Card -->
    <div class="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-6">
      <div class="space-y-4">
        <h3 class="text-sm font-semibold text-slate-200 uppercase tracking-wider text-xs">General Options</h3>
        <div class="flex items-center justify-between py-2 border-b border-slate-800">
          <div>
            <div class="text-sm font-medium text-slate-200">Auto Synchronization</div>
            <div class="text-xs text-slate-500">Automatically sync changes from Whoobe CMS backend</div>
          </div>
          <input type="checkbox" checked class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 border-slate-800" />
        </div>

        <div class="flex items-center justify-between py-2 border-b border-slate-800">
          <div>
            <div class="text-sm font-medium text-slate-200">Debug Logging</div>
            <div class="text-xs text-slate-500">Enable verbose logging for API calls and GraphQL queries</div>
          </div>
          <input type="checkbox" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 border-slate-800" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import DamConfigManager from '../components/dam/DamConfigManager.vue'
import MfaSettingsCard from '../components/auth/MfaSettingsCard.vue'
</script>
