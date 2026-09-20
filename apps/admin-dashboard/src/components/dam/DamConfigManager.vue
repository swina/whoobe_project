<template>
  <div class="space-y-6">
    <!-- Tab Navigation -->
    <div class="flex gap-1 border-b border-slate-800 light:border-slate-200">
      <button
        v-for="tab in tabs" :key="tab.key"
        type="button"
        class="px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition"
        :class="activeTab === tab.key ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-300 light:text-slate-700'"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Header Card -->
    <div v-show="activeTab === 'storage'" class="rounded-2xl bg-slate-900/80 light:bg-white/80 border border-slate-800 light:border-slate-200 p-6 shadow-xl">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-bold text-slate-100 light:text-slate-900">DAM Storage & S3/MinIO Configuration</h3>
            <p class="text-xs text-slate-400 light:text-slate-600">Configure the DAM backend connection and public/private folder visibility rules. Bucket credentials are managed server-side only.</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="damStore.testConnection()"
            :disabled="damStore.connectionStatus === 'testing'"
            class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 light:bg-slate-100 hover:bg-slate-700 light:bg-slate-200 text-slate-200 light:text-slate-800 border border-slate-700 light:border-slate-300 transition flex items-center gap-1.5"
          >
            <span v-if="damStore.connectionStatus === 'testing'" class="animate-spin w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full"></span>
            Test & Sync MinIO Storage
          </button>
          <button
            @click="damStore.resetToDefaults()"
            class="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-400 light:text-slate-600 hover:text-slate-200 light:text-slate-800 transition"
          >
            Reset
          </button>
        </div>
      </div>

      <!-- Status Notification Toast -->
      <div
        v-if="damStore.statusMessage"
        :class="[
          'p-3 rounded-xl text-xs flex items-center gap-2 border transition',
          damStore.connectionStatus === 'success' ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' : '',
          damStore.connectionStatus === 'error' ? 'bg-rose-950/40 border-rose-800/60 text-rose-300' : '',
          damStore.connectionStatus === 'testing' ? 'bg-indigo-950/40 border-indigo-800/60 text-indigo-300' : '',
          damStore.connectionStatus === 'idle' ? 'bg-slate-800/50 light:bg-slate-100/50 border-slate-700 light:border-slate-300 text-slate-300 light:text-slate-700' : ''
        ]"
      >
        <span class="font-medium">{{ damStore.statusMessage }}</span>
      </div>

      <!-- Asset Processor API Connection -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div class="md:col-span-2">
          <label class="block text-xs font-medium text-slate-300 light:text-slate-700 mb-1">DAM Asset Processor API URL</label>
          <input
            v-model="damStore.config.assetProcessorUrl"
            type="text"
            placeholder="http://localhost:3002"
            class="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500 font-mono"
          />
          <p class="text-[10px] text-slate-500 mt-1">
            The admin dashboard never holds S3/MinIO credentials directly. All uploads, deletes, and URL signing are
            performed by this backend service, which reads its own bucket/credentials from server-side environment
            variables.
          </p>
        </div>
      </div>

      <!-- Backend-Owned Storage Info (read-only) -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-800/80 light:border-slate-200/80">
        <div>
          <span class="block text-xs font-medium text-slate-400 light:text-slate-600 mb-1">S3 Bucket (server-configured)</span>
          <div class="w-full px-3 py-2 text-xs rounded-xl bg-slate-950/60 light:bg-white/60 border border-slate-800/60 light:border-slate-200/60 text-slate-300 light:text-slate-700 font-mono">
            {{ damStore.damInfo.bucket || '—' }}
          </div>
        </div>

        <div>
          <span class="block text-xs font-medium text-slate-400 light:text-slate-600 mb-1">S3 / MinIO Endpoint (server-configured)</span>
          <div class="w-full px-3 py-2 text-xs rounded-xl bg-slate-950/60 light:bg-white/60 border border-slate-800/60 light:border-slate-200/60 text-slate-300 light:text-slate-700 font-mono">
            {{ damStore.damInfo.endpoint || '—' }}
          </div>
        </div>

        <div>
          <span class="block text-xs font-medium text-slate-400 light:text-slate-600 mb-1">Key Prefix (server-configured)</span>
          <div class="w-full px-3 py-2 text-xs rounded-xl bg-slate-950/60 light:bg-white/60 border border-slate-800/60 light:border-slate-200/60 text-slate-300 light:text-slate-700 font-mono">
            {{ damStore.damInfo.keyPrefix || 'Root Bucket Storage' }}
          </div>
        </div>

        <div>
          <span class="block text-xs font-medium text-slate-400 light:text-slate-600 mb-1">Public Base URL / CDN (server-configured)</span>
          <div class="w-full px-3 py-2 text-xs rounded-xl bg-slate-950/60 light:bg-white/60 border border-slate-800/60 light:border-slate-200/60 text-slate-300 light:text-slate-700 font-mono">
            {{ damStore.damInfo.publicBaseUrl || '—' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Folder Visibility Strategy Manager -->
    <div v-show="activeTab === 'visibility'" class="rounded-2xl bg-slate-900/80 light:bg-white/80 border border-slate-800 light:border-slate-200 p-6 shadow-xl space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="text-sm font-bold text-slate-100 light:text-slate-900 uppercase tracking-wider text-xs">Folder Visibility Rules Engine</h4>
          <p class="text-xs text-slate-400 light:text-slate-600">Designate public vs private folder path rules. Assets are <strong class="text-amber-400">PRIVATE</strong> by default.</p>
        </div>
        <span class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
          Default: PRIVATE (Signed URLs)
        </span>
      </div>

      <!-- Add Rule Input Bar -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2">
        <input
          v-model="newRulePath"
          type="text"
          placeholder="Path prefix or wildcard (e.g. /public/**, /uploads/marketing/**)"
          class="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-slate-200 light:text-slate-800 focus:outline-none focus:border-indigo-500"
          @keyup.enter="submitAddRule"
        />
        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="newRuleIsPublic = !newRuleIsPublic"
            :class="[
              'px-3 py-2 text-xs font-semibold rounded-xl border transition flex items-center gap-1.5',
              newRuleIsPublic ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            ]"
          >
            <span class="w-2 h-2 rounded-full" :class="newRuleIsPublic ? 'bg-emerald-400' : 'bg-rose-400'"></span>
            {{ newRuleIsPublic ? 'PUBLIC' : 'PRIVATE' }}
          </button>
          <button
            type="button"
            @click="submitAddRule"
            class="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition"
          >
            + Add Rule
          </button>
        </div>
      </div>

      <!-- Rules List -->
      <div class="space-y-2 pt-2">
        <div
          v-for="(rule, idx) in damStore.config.folderRules"
          :key="idx"
          class="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 light:bg-white/60 border border-slate-800/80 light:border-slate-200/80 hover:border-slate-700 light:border-slate-300 transition"
        >
          <div class="flex items-center gap-3">
            <span class="font-mono text-xs text-indigo-300 bg-slate-900 light:bg-white px-2 py-1 rounded-lg border border-slate-800 light:border-slate-200">
              {{ rule.pathPrefix }}
            </span>
          </div>

          <div class="flex items-center gap-3">
            <button
              @click="damStore.toggleRuleVisibility(idx)"
              :class="[
                'px-2.5 py-0.5 text-[11px] font-bold rounded-full border transition',
                rule.isPublic ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              ]"
            >
              {{ rule.isPublic ? 'PUBLIC (Direct CDN)' : 'PRIVATE (Presigned URL)' }}
            </button>
            <button
              @click="damStore.removeFolderRule(idx)"
              class="text-slate-500 hover:text-rose-400 text-xs transition"
              title="Delete rule"
            >
              ✕
            </button>
          </div>
        </div>

        <div v-if="damStore.config.folderRules.length === 0" class="text-center py-6 text-xs text-slate-500 italic">
          No custom visibility rules added. All DAM assets are served as PRIVATE via signed URLs.
        </div>
      </div>
    </div>

    <!-- CDN Mirroring (docs/plans/assets/assets-cdn.md) -->
    <div v-show="activeTab === 'cdn'">
      <CdnMirrorSettingsCard />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDamStore } from '../../stores/damStore'
import CdnMirrorSettingsCard from './CdnMirrorSettingsCard.vue'

const damStore = useDamStore()
const newRulePath = ref('')
const newRuleIsPublic = ref(true)

const tabs: { key: 'storage' | 'visibility' | 'cdn'; label: string }[] = [
  { key: 'storage', label: 'DAM Storage' },
  { key: 'visibility', label: 'Folder Visibility' },
  { key: 'cdn', label: 'CDN Mirroring' },
]
const activeTab = ref<'storage' | 'visibility' | 'cdn'>('storage')

function submitAddRule() {
  if (newRulePath.value.trim()) {
    damStore.addFolderRule(newRulePath.value, newRuleIsPublic.value)
    newRulePath.value = ''
  }
}
</script>
