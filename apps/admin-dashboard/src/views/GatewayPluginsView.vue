<template>
  <div class="space-y-6">
    <div>
      <h3 class="text-sm font-semibold text-slate-200 light:text-slate-800">Integrations — Plugins</h3>
      <p class="text-xs text-slate-500">{{ store.plugins.length }} plugin(s) loaded</p>
    </div>

    <div class="overflow-x-auto rounded-2xl border border-slate-800 light:border-slate-200">
      <table class="w-full text-xs">
        <thead>
          <tr class="bg-slate-900/80 light:bg-slate-100/80">
            <th class="text-left px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Name</th>
            <th class="text-center px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Routes</th>
            <th class="text-center px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Request Middleware</th>
            <th class="text-center px-4 py-3 font-semibold text-slate-300 light:text-slate-700">Response Middleware</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="plugin in store.plugins" :key="plugin.name" class="border-t border-slate-800 light:border-slate-200 hover:bg-slate-800/40 light:hover:bg-slate-100/40">
            <td class="px-4 py-3 text-slate-200 light:text-slate-800 font-medium">{{ plugin.name }}</td>
            <td class="px-4 py-3 text-center">
              <span :class="plugin.hasRoutes ? 'text-emerald-400' : 'text-slate-500'">{{ plugin.hasRoutes ? 'Yes' : 'No' }}</span>
            </td>
            <td class="px-4 py-3 text-center">
              <span :class="plugin.hasRequestMiddleware ? 'text-emerald-400' : 'text-slate-500'">{{ plugin.hasRequestMiddleware ? 'Yes' : 'No' }}</span>
            </td>
            <td class="px-4 py-3 text-center">
              <span :class="plugin.hasResponseMiddleware ? 'text-emerald-400' : 'text-slate-500'">{{ plugin.hasResponseMiddleware ? 'Yes' : 'No' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!store.plugins.length && !store.isLoading" class="text-center py-12 text-slate-500 text-xs">No plugins loaded. Add `.ts` or `.js` files to the gateway's `plugins/` directory.</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useGatewayStore } from '../stores/gatewayStore'

const store = useGatewayStore()

onMounted(() => { store.refreshPlugins() })
</script>