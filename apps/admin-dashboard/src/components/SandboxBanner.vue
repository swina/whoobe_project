<template>
  <div v-if="status" class="w-full bg-amber-500 text-slate-950 text-sm px-4 py-1.5 text-center" role="status">
    <strong>Public sandbox</strong>
    <span> - everything is deleted {{ resetText }}. Files up to {{ maxMb }} MB{{ status.maxAssets ? `, at most ${status.maxAssets} assets` : '' }}; AI, mail and publishing are off.</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getDefaultCoreApiUrl } from '../utils/auth-api'

interface SandboxStatus { resetAt: string | null; maxFileBytes: number; maxAssets: number | null }

const status = ref<SandboxStatus | null>(null)
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined

const maxMb = computed(() => Math.round(((status.value?.maxFileBytes ?? 0) / 1048576) * 10) / 10)
const resetText = computed(() => {
  const at = status.value?.resetAt ? Date.parse(status.value.resetAt) : NaN
  if (!Number.isFinite(at)) return 'every few hours'
  const min = Math.max(0, Math.round((at - now.value) / 60000))
  return min <= 1 ? 'in a minute' : min < 90 ? `in ${min} minutes` : `at ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
})

async function load(): Promise<void> {
  try {
    const res = await fetch(`${getDefaultCoreApiUrl()}/health`)
    status.value = res.ok ? ((await res.json()).sandbox ?? null) : null
  } catch {
    status.value = null
  }
}

onMounted(() => {
  void load()
  timer = setInterval(() => { now.value = Date.now(); if (Math.round((now.value / 1000)) % 300 === 0) void load() }, 1000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>
