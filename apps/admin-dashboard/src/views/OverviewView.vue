<template>
  <div class="space-y-6">
    <!-- Header Banner -->
    <div class="flex flex-col md:flex-row md:items-center justify-between p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-xl relative overflow-hidden">
      <div class="absolute -right-10 -bottom-10 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div class="relative z-10 space-y-1">
        <h2 class="text-2xl font-bold text-white tracking-tight">Welcome back, Administrator 👋</h2>
        <p class="text-slate-400 text-sm">System performance and repository status across Whoobe CMS modules.</p>
      </div>
      <div class="mt-4 md:mt-0 flex items-center space-x-3 relative z-10">
        <button class="px-4 py-2 text-sm font-medium rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition">
          View Logs
        </button>
        <button class="px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 transition">
          + New Data Object
        </button>
      </div>
    </div>

    <!-- Metrics Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      <div 
        v-for="stat in metrics" 
        :key="stat.title" 
        class="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-all duration-200 group"
      >
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-slate-400">{{ stat.title }}</span>
          <div :class="['p-2.5 rounded-xl border', stat.iconBg]">
            <component :is="stat.icon" :class="['w-5 h-5', stat.iconColor]" />
          </div>
        </div>
        <div class="mt-4 flex items-baseline justify-between">
          <div class="text-2xl font-bold text-slate-100 tracking-tight">{{ stat.value }}</div>
          <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full flex items-center', stat.badgeClass]">
            {{ stat.change }}
          </span>
        </div>
      </div>
    </div>

    <!-- Data Grid & Activity Panel -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Recent Data Objects Table (2 Cols) -->
      <div class="lg:col-span-2 rounded-2xl bg-slate-900/60 border border-slate-800/80 p-5 flex flex-col">
        <div class="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 class="font-semibold text-slate-100">Recent Data Objects</h3>
            <p class="text-xs text-slate-400">Latest modified Whoobe CMS objects and entities</p>
          </div>
          <button @click="tabsStore.openSection('objects')" class="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition">
            View All →
          </button>
        </div>

        <div class="overflow-x-auto mt-4">
          <table class="w-full text-left text-sm text-slate-300">
            <thead class="text-xs uppercase bg-slate-950/50 text-slate-400 rounded-lg">
              <tr>
                <th class="px-4 py-3 font-semibold">ID / Name</th>
                <th class="px-4 py-3 font-semibold">Class</th>
                <th class="px-4 py-3 font-semibold">Status</th>
                <th class="px-4 py-3 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60">
              <tr 
                v-for="item in recentObjects" 
                :key="item.id" 
                class="hover:bg-slate-800/40 transition"
              >
                <td class="px-4 py-3.5 font-medium text-slate-200">
                  <div class="flex items-center space-x-2">
                    <span class="text-xs text-slate-500 font-mono">#{{ item.id }}</span>
                    <span>{{ item.name }}</span>
                  </div>
                </td>
                <td class="px-4 py-3.5 text-xs text-slate-400 font-mono bg-slate-950/40 rounded">
                  {{ item.className }}
                </td>
                <td class="px-4 py-3.5">
                  <span 
                    :class="[
                      'px-2.5 py-1 text-[11px] font-semibold rounded-full border',
                      item.published 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    ]"
                  >
                    {{ item.published ? 'Published' : 'Draft' }}
                  </span>
                </td>
                <td class="px-4 py-3.5 text-xs text-slate-400">
                  {{ item.updatedAt }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Activity & System Feed (1 Col) -->
      <div class="rounded-2xl bg-slate-900/60 border border-slate-800/80 p-5 flex flex-col">
        <div class="flex items-center justify-between pb-4 border-b border-slate-800">
          <h3 class="font-semibold text-slate-100">System Activity</h3>
          <span class="text-xs text-slate-500">Real-time</span>
        </div>

        <div class="mt-4 space-y-4 flex-1 overflow-y-auto pr-1">
          <div 
            v-for="act in activityFeed" 
            :key="act.id" 
            class="flex items-start space-x-3 text-sm group"
          >
            <div class="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 shrink-0 mt-0.5">
              <component :is="act.icon" class="w-4 h-4 text-indigo-400" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-slate-200 leading-snug">
                <span class="font-medium text-indigo-300">{{ act.user }}</span> {{ act.action }}
              </p>
              <span class="text-[10px] text-slate-500 mt-1 block">{{ act.time }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  Database,
  FolderArchive,
  FileText,
  Activity,
  PlusCircle,
  RefreshCw,
  CheckCircle2
} from '@lucide/vue'
import { useTabsStore } from '../stores/tabsStore'

const tabsStore = useTabsStore()

const metrics = ref([
  {
    title: 'Total Data Objects',
    value: '1,428',
    change: '+12%',
    badgeClass: 'bg-emerald-500/10 text-emerald-400',
    icon: Database,
    iconBg: 'bg-indigo-500/10 border-indigo-500/20',
    iconColor: 'text-indigo-400'
  },
  {
    title: 'Asset Storage',
    value: '42.8 GB',
    change: '+3.4 GB',
    badgeClass: 'bg-indigo-500/10 text-indigo-400',
    icon: FolderArchive,
    iconBg: 'bg-violet-500/10 border-violet-500/20',
    iconColor: 'text-violet-400'
  },
  {
    title: 'Published Documents',
    value: '354',
    change: '+5',
    badgeClass: 'bg-emerald-500/10 text-emerald-400',
    icon: FileText,
    iconBg: 'bg-cyan-500/10 border-cyan-500/20',
    iconColor: 'text-cyan-400'
  },
  {
    title: 'API Throughput',
    value: '99.98%',
    change: 'Healthy',
    badgeClass: 'bg-emerald-500/10 text-emerald-400',
    icon: Activity,
    iconBg: 'bg-emerald-500/10 border-emerald-500/20',
    iconColor: 'text-emerald-400'
  }
])

const recentObjects = ref([
  { id: 104, name: 'Product_Catalog_2026', className: 'ProductCategory', published: true, updatedAt: '2 mins ago' },
  { id: 103, name: 'Customer_Account_882', className: 'CustomerProfile', published: true, updatedAt: '15 mins ago' },
  { id: 102, name: 'Winter_Campaign_Banner', className: 'MediaAssetRef', published: false, updatedAt: '1 hour ago' },
  { id: 101, name: 'Pricing_Tier_Enterprise', className: 'PricingModel', published: true, updatedAt: '3 hours ago' },
  { id: 100, name: 'Localized_Content_ES', className: 'TranslationKey', published: false, updatedAt: '5 hours ago' }
])

const activityFeed = ref([
  { id: 1, user: 'Admin', action: 'updated Product_Catalog_2026 object', time: '2 mins ago', icon: RefreshCw },
  { id: 2, user: 'System', action: 'completed nightly asset sync (124 items)', time: '1 hour ago', icon: CheckCircle2 },
  { id: 3, user: 'Editor', action: 'created new Winter_Campaign_Banner draft', time: '1 hour ago', icon: PlusCircle },
  { id: 4, user: 'Admin', action: 'modified System Settings config', time: '4 hours ago', icon: RefreshCw }
])
</script>
