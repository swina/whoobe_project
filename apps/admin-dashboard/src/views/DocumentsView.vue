<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-slate-100">Documents & Pages</h2>
        <p class="text-xs text-slate-400">Content pages, navigation structures, and snippet documents.</p>
      </div>
      <button class="px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition">
        + New Document
      </button>
    </div>

    <div class="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 space-y-3">
      <div v-for="doc in docs" :key="doc.id" class="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:bg-slate-800/40 transition">
        <div class="flex items-center space-x-3">
          <FileText class="w-5 h-5 text-indigo-400" />
          <div>
            <div class="text-sm font-medium text-slate-200">{{ doc.title }}</div>
            <div class="text-xs text-slate-500">{{ doc.path }}</div>
          </div>
        </div>
        <span class="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">Published</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { FileText } from '@lucide/vue'

const docs = ref([
  { id: 1, title: 'Homepage Main Template', path: '/en/home' },
  { id: 2, title: 'Privacy Policy & Terms', path: '/en/legal/privacy' },
  { id: 3, title: 'Contact Us Landing Page', path: '/en/contact' }
])
</script>
