<template>
  <div class="h-full flex flex-col">
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div class="space-y-6 max-w-6xl">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">System Logs</h2>
            <p class="text-xs text-slate-400 light:text-slate-600">View and search logs by application</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-2">
            <label class="text-xs font-medium text-slate-400 light:text-slate-600">App</label>
            <select
              :value="logStore.selectedApp"
              @change="logStore.selectApp(($event.target as HTMLSelectElement).value)"
              class="bg-slate-800 light:bg-slate-100 border border-slate-700 light:border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-200 light:text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option v-for="app in logStore.APPS" :key="app" :value="app">{{ app }}</option>
            </select>
          </div>

          <div class="flex items-center gap-2">
            <label class="text-xs font-medium text-slate-400 light:text-slate-600">Date</label>
            <input
              type="date"
              :value="logStore.selectedDate"
              @change="logStore.selectDate(($event.target as HTMLInputElement).value)"
              class="bg-slate-800 light:bg-slate-100 border border-slate-700 light:border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-200 light:text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div v-if="logStore.logFiles.length > 0" class="flex flex-wrap gap-2">
            <button
              v-for="file in logStore.logFiles"
              :key="file.filename"
              @click="logStore.fetchLogContent(file.path)"
              :class="['px-2 py-1 rounded text-xs font-medium transition', logStore.selectedDate && file.filename.includes(logStore.selectedDate) ? 'bg-indigo-600 text-white' : 'bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-600 hover:text-slate-200']"
            >
              {{ file.filename.replace(/\.log$/, '') }}
            </button>
          </div>
        </div>

        <div class="flex items-center gap-3 px-3 py-2 bg-slate-800/50 light:bg-slate-100 rounded-xl border border-slate-700 light:border-slate-200">
          <span class="text-xs font-medium text-slate-400 light:text-slate-600 shrink-0">Filter</span>
          <input
            v-model="levelFilter"
            placeholder="level (error, warn, info)"
            class="bg-transparent border border-slate-700 light:border-slate-300 rounded px-2 py-1 w-32 text-xs text-slate-200 light:text-slate-800 outline-none"
          />
          <input
            v-model="moduleFilter"
            placeholder="module (auth, dam, ai...)"
            class="bg-transparent border border-slate-700 light:border-slate-300 rounded px-2 py-1 w-36 text-xs text-slate-200 light:text-slate-800 outline-none"
          />
          <input
            v-model="searchQuery"
            placeholder="search message..."
            class="bg-transparent border border-slate-700 light:border-slate-300 rounded px-2 py-1 w-48 text-xs text-slate-200 light:text-slate-800 outline-none"
          />
          <button
            @click="copyFilteredLogs"
            class="ml-auto px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
          >
            Copy filtered
          </button>
        </div>

        <div v-if="logStore.isLoading" class="flex justify-center py-12">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        </div>

        <div v-else-if="logStore.error" class="rounded-2xl bg-red-900/20 border border-red-800 p-4">
          <p class="text-xs text-red-400">{{ logStore.error }}</p>
        </div>

        <div v-else-if="logStore.logContent.length === 0" class="rounded-2xl bg-slate-900/60 light:bg-white/60 border border-slate-800 light:border-slate-200 p-8 text-center">
          <p class="text-xs text-slate-500">No log entries found. Select an app and date to view logs.</p>
        </div>

        <div v-else class="space-y-1 font-mono text-xs">
          <div
            v-for="(entry, i) in filteredLogs"
            :key="i"
            :class="['rounded-lg px-3 py-2 border transition cursor-pointer hover:bg-slate-800/80 light:hover:bg-slate-100', levelColor(entry.level)]"
            @click="toggleExpand(i)"
          >
            <div class="flex items-center gap-3">
              <span :class="['w-12 shrink-0 text-xs font-bold uppercase', levelTextColor(entry.level)]">{{ entry.level }}</span>
              <span class="text-slate-500 light:text-slate-500 w-20 shrink-0">{{ formatTime(entry.time) }}</span>
              <span v-if="entry.module" class="w-16 shrink-0 text-indigo-400 light:text-indigo-600 font-semibold">{{ entry.module }}</span>
              <span class="text-slate-200 light:text-slate-800 truncate flex-1">{{ entry.msg }}</span>
              <span v-if="entry.err?.message" class="text-red-400 light:text-red-600 truncate max-w-[200px]">{{ entry.err.message }}</span>
              <ChevronRight v-if="!expanded[i]" class="w-3 h-3 text-slate-500 shrink-0" />
              <ChevronDown v-else class="w-3 h-3 text-slate-500 shrink-0" />
            </div>
            <div v-if="expanded[i]" class="mt-2 pt-2 border-t border-slate-700 light:border-slate-200 overflow-x-auto">
              <pre class="text-xs text-slate-400 light:text-slate-600 whitespace-pre-wrap">{{ JSON.stringify(entry, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronRight, ChevronDown } from '@lucide/vue'
import { useLogStore } from '../stores/logStore'

const logStore = useLogStore()

const levelFilter = ref('')
const moduleFilter = ref('')
const searchQuery = ref('')
const expanded = ref<Record<number, boolean>>({})

const filteredLogs = computed(() => {
  return logStore.logContent.filter((entry) => {
    if (levelFilter.value && !entry.level?.toLowerCase().includes(levelFilter.value.toLowerCase())) return false
    if (moduleFilter.value && !entry.module?.toLowerCase().includes(moduleFilter.value.toLowerCase())) return false
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      const matchesMsg = entry.msg?.toLowerCase().includes(q)
      const matchesErr = entry.err?.message?.toLowerCase().includes(q)
      if (!matchesMsg && !matchesErr) return false
    }
    return true
  })
})

function levelColor(level: string): string {
  if (level === 'error' || level === 'fatal') return 'bg-red-900/10 border-red-900/30'
  if (level === 'warn') return 'bg-amber-900/10 border-amber-900/30'
  if (level === 'info') return 'bg-slate-100/40 border-slate-700/30'
  return 'bg-slate-100/30 border-slate-800/20'
}

function levelTextColor(level: string): string {
  if (level === 'error' || level === 'fatal') return 'text-red-400 light:text-red-600'
  if (level === 'warn') return 'text-amber-400 light:text-amber-600'
  if (level === 'info') return 'text-sky-400 light:text-sky-600'
  return 'text-slate-400 light:text-slate-600'
}

function formatTime(time: string): string {
  if (!time) return ''
  try {
    const d = new Date(time)
    return d.toLocaleTimeString()
  } catch {
    return time.slice(11, 19)
  }
}

function toggleExpand(i: number) {
  expanded.value[i] = !expanded.value[i]
}

function copyFilteredLogs() {
  const text = filteredLogs.value.map((e) => JSON.stringify(e)).join('\n')
  navigator.clipboard.writeText(text)
}
</script>