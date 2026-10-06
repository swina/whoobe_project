<template>
  <div ref="root">
    <div v-if="showWaveform" class="flex items-center gap-3 w-full">
      <button
        type="button"
        class="shrink-0 flex items-center justify-center w-10 h-10 rounded-full text-white shadow"
        :style="{ backgroundColor: opts.progressColor }"
        :aria-label="playing ? 'Pause' : 'Play'"
        @click="toggle"
      >
        <Pause v-if="playing" class="w-4 h-4" />
        <Play v-else class="w-4 h-4 ml-0.5" />
      </button>
      <canvas
        ref="canvas"
        class="flex-1 min-w-0 cursor-pointer touch-none"
        :style="{ height: opts.height + 'px' }"
        role="slider"
        tabindex="0"
        aria-label="Seek"
        :aria-valuemin="0"
        :aria-valuemax="Math.round(duration)"
        :aria-valuenow="Math.round(current)"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="dragging = false"
        @pointercancel="dragging = false"
        @keydown="onKey"
      ></canvas>
      <span v-if="opts.controls" class="shrink-0 text-xs tabular-nums opacity-70">{{ fmt(current) }} / {{ fmt(duration) }}</span>
    </div>
    <audio
      ref="audioEl"
      :src="src || undefined"
      :class="showWaveform ? 'hidden' : 'block w-full'"
      :controls="!showWaveform && opts.controls"
      :autoplay="opts.autoplay"
      :loop="opts.loop"
      :preload="opts.preload"
      @loadedmetadata="onMeta"
      @durationchange="onMeta"
      @timeupdate="onTime"
      @play="playing = true"
      @pause="playing = false"
      @ended="playing = false"
    ></audio>
  </div>
</template>

<script setup lang="ts">
// The Audio element (ElementsClass.js Audio(), docs/release/guides/audio-element.md). Mode 'player': the browser's own
// <audio controls>. Mode 'waveform': a custom player; if the waveform cannot be computed the plain player is shown instead,
// so the audio is never lost. The template has ONE root element and no comment before it: in development Vue keeps a
// leading comment, which turns the component into a fragment (no attribute fallthrough, $el is not the element).
// `src` is already resolved by the
// host (resolveDisplayUrl(imageURL(element.image)): a DAM asset or any URL), `options` is the element's own settings.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Pause, Play } from '@lucide/vue'
import { loadPeaks, normalizeAudioOptions, placeholderPeaks } from '../scripts/audio-waveform'

const props = defineProps<{ src?: string; options?: unknown }>()

const opts = computed(() => normalizeAudioOptions(props.options))
const audioEl = ref<HTMLAudioElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const root = ref<HTMLElement | null>(null)

const playing = ref(false)
const current = ref(0)
const duration = ref(0)
const dragging = ref(false)
const peaks = ref<number[] | null>(null)
const failed = ref(false)

const wantsWaveform = computed(() => opts.value.mode === 'waveform' && !!props.src)
const showWaveform = computed(() => wantsWaveform.value && !failed.value)

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function onMeta() { duration.value = audioEl.value?.duration && Number.isFinite(audioEl.value.duration) ? audioEl.value.duration : 0 }
function onTime() { current.value = audioEl.value?.currentTime ?? 0; draw() }

function toggle() {
  const a = audioEl.value
  if (!a) return
  if (a.paused) a.play().catch(() => { /* blocked by the browser: the visitor presses play again */ })
  else a.pause()
}

function seekTo(clientX: number) {
  const a = audioEl.value
  const c = canvas.value
  if (!a || !c || !duration.value) return
  const rect = c.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  a.currentTime = ratio * duration.value
  current.value = a.currentTime
  draw()
}
function onPointerDown(e: PointerEvent) { dragging.value = true; (e.target as Element).setPointerCapture?.(e.pointerId); seekTo(e.clientX) }
function onPointerMove(e: PointerEvent) { if (dragging.value) seekTo(e.clientX) }
function onKey(e: KeyboardEvent) {
  const a = audioEl.value
  if (!a) return
  if (e.key === 'ArrowRight') { a.currentTime = Math.min(duration.value, a.currentTime + 5); e.preventDefault() }
  else if (e.key === 'ArrowLeft') { a.currentTime = Math.max(0, a.currentTime - 5); e.preventDefault() }
  else if (e.key === ' ' || e.key === 'Enter') { toggle(); e.preventDefault() }
}

function draw() {
  const c = canvas.value
  if (!c || !showWaveform.value) return
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.floor(c.clientWidth * dpr))
  const h = Math.max(1, Math.floor(opts.value.height * dpr))
  if (c.width !== w) c.width = w
  if (c.height !== h) c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  const bar = Math.max(1, Math.round(2 * dpr))
  const gap = Math.max(1, Math.round(1 * dpr))
  const count = Math.max(1, Math.floor(w / (bar + gap)))
  // the real peaks once decoded; a stable placeholder (dimmed) while they load
  const data = peaks.value ?? placeholderPeaks(props.src ?? '', count)
  const progress = duration.value ? current.value / duration.value : 0
  ctx.globalAlpha = peaks.value ? 1 : 0.45
  for (let i = 0; i < count; i++) {
    const p = data[Math.min(data.length - 1, Math.floor((i / count) * data.length))]
    const barH = Math.max(2 * dpr, p * h)
    ctx.fillStyle = i / count < progress ? opts.value.progressColor : opts.value.waveColor
    ctx.fillRect(i * (bar + gap), (h - barH) / 2, bar, barH)
  }
  ctx.globalAlpha = 1
}

let observer: ResizeObserver | null = null

async function loadWave() {
  peaks.value = null
  failed.value = false
  if (!wantsWaveform.value) return
  const url = props.src
  if (!url) return
  try {
    const p = await loadPeaks(url)
    if (url === props.src) peaks.value = p
  } catch {
    // CORS, an undecodable format or a very large file: show the plain player
    if (url === props.src) failed.value = true
  }
  await nextTick()
  draw()
}

watch(() => [props.src, opts.value.mode], async () => { await nextTick(); loadWave() })
watch(() => [opts.value.waveColor, opts.value.progressColor, opts.value.height], () => nextTick(draw))
watch(showWaveform, async (on) => { if (on) { await nextTick(); watchCanvasSize(); draw() } })

function watchCanvasSize() {
  observer?.disconnect()
  if (canvas.value && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => draw())
    observer.observe(canvas.value)
  }
}

onMounted(async () => { await loadWave(); watchCanvasSize(); onMeta() })
onBeforeUnmount(() => { observer?.disconnect(); audioEl.value?.pause() })
</script>
