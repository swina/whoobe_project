<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-bold text-slate-100">Pages</h2>
      <p class="text-xs text-slate-400">Website pages built with the Whoobe One page composer (authored directly, or migrated from Pimcore). Click a row to open it in the editor.</p>
    </div>

    <div v-if="pagesStore.isLoading && pagesStore.pages.length === 0" class="p-12 text-center text-xs text-slate-500">
      Loading pages…
    </div>

    <div v-else-if="pagesStore.pages.length === 0" class="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-12 text-center text-xs text-slate-500">
      No pages yet. Create one in the Whoobe One editor, or run the migration tool's `migrate-documents` command to import from Pimcore.
    </div>

    <div v-else class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 shadow-xl">
      <table class="w-full text-left text-xs text-slate-300">
        <thead class="bg-slate-950/80 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          <tr>
            <th class="py-3 px-4 w-8"></th>
            <th class="py-3 px-4">Title</th>
            <th class="py-3 px-4">Slug</th>
            <th class="py-3 px-4">Locale</th>
            <th class="py-3 px-4">Status</th>
            <th class="py-3 px-4">Pimcore ID</th>
            <th class="py-3 px-4">Updated</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60">
          <tr
            v-for="page in pagesStore.pages"
            :key="page.id"
            @click="tabsStore.openPage(page.id)"
            class="cursor-pointer hover:bg-slate-800/50 transition"
          >
            <td class="py-2.5 px-4 text-center">
              <FileText class="w-4 h-4 text-indigo-400 inline" />
            </td>
            <td class="py-2.5 px-4 font-semibold text-slate-100">{{ page.title }}</td>
            <td class="py-2.5 px-4 font-mono text-indigo-300">{{ page.slug }}</td>
            <td class="py-2.5 px-4 text-slate-400">{{ page.locale }}</td>
            <td class="py-2.5 px-4">
              <span
                :class="[
                  'px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase',
                  page.published ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                ]"
              >
                {{ page.published ? 'published' : (page.workflowState || 'draft') }}
              </span>
            </td>
            <td class="py-2.5 px-4 text-slate-500 font-mono">{{ page.pimcoreId ?? '—' }}</td>
            <td class="py-2.5 px-4 text-slate-400">{{ new Date(page.updatedAt).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FileText } from '@lucide/vue'
import { usePagesStore } from '../stores/pagesStore'
import { useTabsStore } from '../stores/tabsStore'

const pagesStore = usePagesStore()
const tabsStore = useTabsStore()
</script>
