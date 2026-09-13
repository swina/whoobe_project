<template>
  <div class="flex flex-col gap-3 p-3 text-xs">
    <div class="font-semibold text-indigo-600 mb-1">PWA Configuration</div>

    <label class="flex flex-col gap-1">
      <span class="text-gray-500">App Name (short)</span>
      <input v-model="config.shortName" class="border rounded px-2 py-1 text-xs" placeholder="MyApp" />
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-gray-500">Display Mode</span>
      <select v-model="config.display" class="border rounded px-2 py-1 text-xs">
        <option value="standalone">Standalone</option>
        <option value="fullscreen">Fullscreen</option>
        <option value="minimal-ui">Minimal UI</option>
      </select>
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-gray-500">Orientation</span>
      <select v-model="config.orientation" class="border rounded px-2 py-1 text-xs">
        <option value="portrait">Portrait</option>
        <option value="landscape">Landscape</option>
        <option value="any">Any</option>
      </select>
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-gray-500">Background Color</span>
      <div class="flex gap-1">
        <input v-model="config.backgroundColor" type="color" class="w-8 h-8 border rounded cursor-pointer" />
        <input v-model="config.backgroundColor" class="flex-1 border rounded px-2 py-1 text-xs font-mono" placeholder="#ffffff" />
      </div>
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-gray-500">Theme Color</span>
      <div class="flex gap-1">
        <input v-model="config.themeColor" type="color" class="w-8 h-8 border rounded cursor-pointer" />
        <input v-model="config.themeColor" class="flex-1 border rounded px-2 py-1 text-xs font-mono" placeholder="#4f46e5" />
      </div>
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-gray-500">Start URL</span>
      <input v-model="config.startUrl" class="border rounded px-2 py-1 text-xs" placeholder="/" />
    </label>

    <fieldset class="border rounded p-2">
      <legend class="text-gray-500 px-1 font-medium">Push Notifications</legend>
      <label class="flex items-center gap-2 mt-1">
        <input v-model="pushProvider" type="radio" value="self" />
        <span>Self-hosted (VAPID)</span>
      </label>
      <label class="flex items-center gap-2">
        <input v-model="pushProvider" type="radio" value="onesignal" />
        <span>OneSignal</span>
      </label>
      <label class="flex items-center gap-2">
        <input v-model="pushProvider" type="radio" value="firebase" />
        <span>Firebase</span>
      </label>

      <template v-if="pushProvider === 'onesignal'">
        <label class="flex flex-col gap-1 mt-2">
          <span class="text-gray-500">App ID</span>
          <input v-model="onesignalAppId" class="border rounded px-2 py-1 text-xs font-mono" placeholder="..." />
        </label>
        <label class="flex flex-col gap-1 mt-1">
          <span class="text-gray-500">REST API Key</span>
          <input v-model="onesignalApiKey" type="password" class="border rounded px-2 py-1 text-xs font-mono" placeholder="..." />
        </label>
      </template>

      <template v-if="pushProvider === 'firebase'">
        <label class="flex flex-col gap-1 mt-2">
          <span class="text-gray-500">Project ID</span>
          <input v-model="firebaseProjectId" class="border rounded px-2 py-1 text-xs font-mono" placeholder="..." />
        </label>
        <label class="flex flex-col gap-1 mt-1">
          <span class="text-gray-500">Web API Key</span>
          <input v-model="firebaseApiKey" class="border rounded px-2 py-1 text-xs font-mono" placeholder="..." />
        </label>
        <label class="flex flex-col gap-1 mt-1">
          <span class="text-gray-500">Sender ID</span>
          <input v-model="firebaseSenderId" class="border rounded px-2 py-1 text-xs font-mono" placeholder="..." />
        </label>
        <label class="flex flex-col gap-1 mt-1">
          <span class="text-gray-500">App ID</span>
          <input v-model="firebaseAppId" class="border rounded px-2 py-1 text-xs font-mono" placeholder="..." />
        </label>
        <label class="flex flex-col gap-1 mt-1">
          <span class="text-gray-500">Service Account JSON</span>
          <textarea v-model="firebaseServiceAccount" class="border rounded px-2 py-1 text-xs font-mono" rows="4" placeholder="Paste service account JSON..."></textarea>
        </label>
      </template>
    </fieldset>

    <div class="text-[10px] text-gray-400 mt-1">
      PWA config is saved with the page content when app mode is active.
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../store/editor.js'

const editor = useEditorStore()

const config = computed({
  get: () => editor.pwaConfig as Record<string, any>,
  set: (v) => editor.setPwaConfig(v),
})

const pushProvider = computed({
  get: () => (config.value.push as Record<string, any>)?.provider ?? 'self',
  set: (v) => {
    const push = (config.value.push ?? {}) as Record<string, any>
    push.provider = v
    config.value.push = push
  },
})

const onesignalAppId = computed({
  get: () => ((config.value.push ?? {}) as Record<string, any>).onesignalAppId ?? '',
  set: (v) => {
    const push = (config.value.push ?? {}) as Record<string, any>
    push.onesignalAppId = v
    config.value.push = push
  },
})

const onesignalApiKey = computed({
  get: () => ((config.value.push ?? {}) as Record<string, any>).onesignalApiKey ?? '',
  set: (v) => {
    const push = (config.value.push ?? {}) as Record<string, any>
    push.onesignalApiKey = v
    config.value.push = push
  },
})

const firebaseProjectId = computed({
  get: () => ((config.value.push ?? {}) as Record<string, any>).firebaseProjectId ?? '',
  set: (v) => {
    const push = (config.value.push ?? {}) as Record<string, any>
    push.firebaseProjectId = v
    config.value.push = push
  },
})

const firebaseApiKey = computed({
  get: () => ((config.value.push ?? {}) as Record<string, any>).firebaseApiKey ?? '',
  set: (v) => {
    const push = (config.value.push ?? {}) as Record<string, any>
    push.firebaseApiKey = v
    config.value.push = push
  },
})

const firebaseSenderId = computed({
  get: () => ((config.value.push ?? {}) as Record<string, any>).firebaseSenderId ?? '',
  set: (v) => {
    const push = (config.value.push ?? {}) as Record<string, any>
    push.firebaseSenderId = v
    config.value.push = push
  },
})

const firebaseAppId = computed({
  get: () => ((config.value.push ?? {}) as Record<string, any>).firebaseAppId ?? '',
  set: (v) => {
    const push = (config.value.push ?? {}) as Record<string, any>
    push.firebaseAppId = v
    config.value.push = push
  },
})

const firebaseServiceAccount = computed({
  get: () => ((config.value.push ?? {}) as Record<string, any>).firebaseServiceAccount ?? '',
  set: (v) => {
    const push = (config.value.push ?? {}) as Record<string, any>
    push.firebaseServiceAccount = v
    config.value.push = push
  },
})
</script>