<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-slate-100">Data Objects</h2>
        <p class="text-xs text-slate-400">Manage Whoobe CMS data objects, schemas, and fields.</p>
      </div>
      <button class="px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition">
        + Create Object
      </button>
    </div>

    <!-- Filter & Search Bar -->
    <div class="flex flex-col sm:flex-row gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
      <input 
        v-model="searchQuery"
        type="text" 
        placeholder="Filter by object name or class..." 
        class="flex-1 px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
      />
      <select v-model="selectedClass" class="px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500">
        <option value="">All Classes</option>
        <option value="ProductCategory">ProductCategory</option>
        <option value="CustomerProfile">CustomerProfile</option>
        <option value="PricingModel">PricingModel</option>
      </select>
    </div>

    <!-- Data Table -->
    <div class="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
      <table class="w-full text-left text-sm text-slate-300">
        <thead class="text-xs uppercase bg-slate-950/70 text-slate-400 border-b border-slate-800">
          <tr>
            <th class="px-4 py-3 font-semibold">ID</th>
            <th class="px-4 py-3 font-semibold">Key / Path</th>
            <th class="px-4 py-3 font-semibold">Class</th>
            <th class="px-4 py-3 font-semibold">Modification Date</th>
            <th class="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60">
          <tr v-for="obj in filteredObjects" :key="obj.id" class="hover:bg-slate-800/40 transition">
            <td class="px-4 py-3.5 font-mono text-xs text-slate-400">#{{ obj.id }}</td>
            <td class="px-4 py-3.5 font-medium text-slate-200">{{ obj.key }}</td>
            <td class="px-4 py-3.5"><span class="px-2 py-0.5 text-xs bg-slate-800 rounded font-mono text-indigo-300">{{ obj.class }}</span></td>
            <td class="px-4 py-3.5 text-xs text-slate-400">{{ obj.updatedAt }}</td>
            <td class="px-4 py-3.5 text-right">
              <button class="text-xs font-medium text-indigo-400 hover:text-indigo-300 mr-3">Edit</button>
              <button class="text-xs font-medium text-rose-400 hover:text-rose-300">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const searchQuery = ref('')
const selectedClass = ref('')

const objects = ref([
  { id: 101, key: '/products/electronics/laptops', class: 'ProductCategory', updatedAt: '2026-07-31 14:20' },
  { id: 102, key: '/customers/enterprise/acme_corp', class: 'CustomerProfile', updatedAt: '2026-07-30 09:12' },
  { id: 103, key: '/pricing/global_v2', class: 'PricingModel', updatedAt: '2026-07-29 18:45' },
  { id: 104, key: '/products/apparel/outerwear', class: 'ProductCategory', updatedAt: '2026-07-28 11:30' }
])

const filteredObjects = computed(() => {
  return objects.value.filter(o => {
    const matchesSearch = o.key.toLowerCase().includes(searchQuery.value.toLowerCase()) || o.class.toLowerCase().includes(searchQuery.value.toLowerCase())
    const matchesClass = !selectedClass.value || o.class === selectedClass.value
    return matchesSearch && matchesClass
  })
})
</script>
