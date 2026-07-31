<template>
  <div class="space-y-6">
    <!-- Header Card -->
    <div class="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-xl">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-bold text-slate-100">DAM Storage & S3/MinIO Configuration</h3>
            <p class="text-xs text-slate-400">Manage S3 bucket credentials, root path settings, and public/private folder visibility rules.</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="damStore.testConnection()"
            :disabled="damStore.connectionStatus === 'testing'"
            class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
          >
            <span v-if="damStore.connectionStatus === 'testing'" class="animate-spin w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full"></span>
            Test & Sync MinIO Storage
          </button>
          <button
            @click="damStore.resetToDefaults()"
            class="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-400 hover:text-slate-200 transition"
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
          damStore.connectionStatus === 'idle' ? 'bg-slate-800/50 border-slate-700 text-slate-300' : ''
        ]"
      >
        <span class="font-medium">{{ damStore.statusMessage }}</span>
      </div>

      <!-- S3 Connection Settings Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div>
          <label class="block text-xs font-medium text-slate-300 mb-1">S3 Bucket Name</label>
          <input
            v-model="damStore.config.bucket"
            type="text"
            placeholder="e.g. whoobe-assets"
            class="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-300 mb-1">S3 / MinIO Endpoint URL</label>
          <input
            v-model="damStore.config.endpoint"
            type="text"
            placeholder="http://localhost:9000"
            class="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-300 mb-1">AWS Region</label>
          <input
            v-model="damStore.config.region"
            type="text"
            placeholder="us-east-1"
            class="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-300 mb-1">
            Key Prefix (Folder Path in Bucket)
          </label>
          <input
            v-model="damStore.config.keyPrefix"
            type="text"
            placeholder="Leave empty for Root Bucket (e.g. logos/file.png)"
            class="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
          <p class="text-[10px] text-slate-500 mt-1">
            <span v-if="!damStore.config.keyPrefix" class="text-indigo-400 font-semibold">Root Bucket Storage Enabled:</span>
            <span v-else class="text-slate-400">Prefix: "{{ damStore.config.keyPrefix }}"</span>
            Assets will map directly to <code class="font-mono text-slate-300">{{ damStore.config.keyPrefix ? damStore.config.keyPrefix + '/' : '' }}path/to/asset.png</code>
          </p>
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-300 mb-1">Access Key ID</label>
          <input
            v-model="damStore.config.accessKeyId"
            type="text"
            placeholder="minioadmin"
            class="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-300 mb-1">Secret Access Key</label>
          <input
            v-model="damStore.config.secretAccessKey"
            type="password"
            placeholder="••••••••••••"
            class="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>

        <div class="md:col-span-2">
          <label class="block text-xs font-medium text-slate-300 mb-1">Public Base URL / CDN URL (Optional)</label>
          <input
            v-model="damStore.config.publicBaseUrl"
            type="text"
            placeholder="https://cdn.example.com (Leave empty to construct from S3 Endpoint)"
            class="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div class="md:col-span-2 flex items-center gap-2 pt-2 border-t border-slate-800/80">
          <input
            v-model="damStore.config.forcePathStyle"
            type="checkbox"
            id="forcePathStyle"
            class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 border-slate-800"
          />
          <label for="forcePathStyle" class="text-xs text-slate-300 font-medium">
            Force Path Style URLs (Required for MinIO compatibility)
          </label>
        </div>
      </div>
    </div>

    <!-- Folder Visibility Strategy Manager -->
    <div class="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-xl space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="text-sm font-bold text-slate-100 uppercase tracking-wider text-xs">Folder Visibility Rules Engine</h4>
          <p class="text-xs text-slate-400">Designate public vs private folder path rules. Assets are <strong class="text-amber-400">PRIVATE</strong> by default.</p>
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
          class="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
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
          class="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition"
        >
          <div class="flex items-center gap-3">
            <span class="font-mono text-xs text-indigo-300 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDamStore } from '../stores/damStore'

const damStore = useDamStore()
const newRulePath = ref('')
const newRuleIsPublic = ref(true)

function submitAddRule() {
  if (newRulePath.value.trim()) {
    damStore.addFolderRule(newRulePath.value, newRuleIsPublic.value)
    newRulePath.value = ''
  }
}
</script>
