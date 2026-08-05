<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">Documents & Pages</h2>
      <p class="text-xs text-slate-400 light:text-slate-600">Pages migrated from Pimcore (or authored directly). Click a row to preview its content tree.</p>
    </div>

    <div v-if="documentsStore.isLoading && documentsStore.documents.length === 0" class="p-12 text-center text-xs text-slate-500">
      Loading documents…
    </div>

    <div v-else-if="documentsStore.documents.length === 0" class="rounded-2xl bg-slate-900/40 light:bg-white/40 border border-slate-800/80 light:border-slate-200/80 p-12 text-center text-xs text-slate-500">
      No documents yet. Run the migration tool's `migrate-documents` command to import from Pimcore.
    </div>

    <div v-else class="overflow-x-auto rounded-xl border border-slate-800 light:border-slate-200 bg-slate-900/60 light:bg-white/60 shadow-xl">
      <table class="w-full text-left text-xs text-slate-300 light:text-slate-700">
        <thead class="bg-slate-950/80 light:bg-white/80 border-b border-slate-800 light:border-slate-200 text-[11px] font-semibold text-slate-400 light:text-slate-600 uppercase tracking-wider">
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
        <tbody class="divide-y divide-slate-800/60 light:divide-slate-200/60">
          <tr
            v-for="doc in documentsStore.documents"
            :key="doc.id"
            @click="tabsStore.openDocument(doc.id)"
            class="cursor-pointer hover:bg-slate-800/50 light:bg-slate-100/50 transition"
          >
            <td class="py-2.5 px-4 text-center">
              <FileText class="w-4 h-4 text-indigo-400 inline" />
            </td>
            <td class="py-2.5 px-4 font-semibold text-slate-100 light:text-slate-900">{{ doc.title }}</td>
            <td class="py-2.5 px-4 font-mono text-indigo-300">{{ doc.slug }}</td>
            <td class="py-2.5 px-4 text-slate-400 light:text-slate-600">{{ doc.locale }}</td>
            <td class="py-2.5 px-4">
              <span
                :class="[
                  'px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase',
                  doc.status === 'published' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                ]"
              >
                {{ doc.status }}
              </span>
            </td>
            <td class="py-2.5 px-4 text-slate-500 font-mono">{{ doc.pimcoreId ?? '—' }}</td>
            <td class="py-2.5 px-4 text-slate-400 light:text-slate-600">{{ new Date(doc.updatedAt).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FileText } from '@lucide/vue'
import { useDocumentsStore } from '../stores/documentsStore'
import { useTabsStore } from '../stores/tabsStore'

const documentsStore = useDocumentsStore()
const tabsStore = useTabsStore()
</script>
