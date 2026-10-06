<template>
  <div v-if="el" class="p-2 border-b bg-white flex flex-col gap-2 text-xs">
    <div class="flex items-center gap-1.5 font-semibold text-gray-600">
      <AudioLines class="w-3.5 h-3.5 text-indigo-500" /> Audio
    </div>

    <label class="flex flex-col gap-0.5 text-[10px] text-gray-500">
      Source: an asset of the library or any URL
      <div class="flex gap-1">
        <input
          :value="source"
          type="text"
          placeholder="/audio/track.mp3  or  https://..."
          class="flex-1 min-w-0 text-xs border rounded px-1.5 py-1 font-mono"
          @change="setSource(($event.target as HTMLInputElement).value)"
        />
        <button type="button" class="shrink-0 px-2 py-1 rounded border bg-gray-50 hover:border-indigo-400 text-gray-600 flex items-center gap-1" title="Browse the audio assets" @click="showPicker = true">
          <FolderOpen class="w-3.5 h-3.5" />
        </button>
      </div>
    </label>

    <div class="flex flex-col gap-1 text-[10px] text-gray-500">
      Look
      <label class="flex items-start gap-1.5 text-xs text-gray-700">
        <input type="radio" class="mt-0.5" value="player" :checked="o.mode === 'player'" @change="set('mode', 'player')" />
        <span>Player <span class="block text-[10px] text-gray-400">The browser's own audio player.</span></span>
      </label>
      <label class="flex items-start gap-1.5 text-xs text-gray-700">
        <input type="radio" class="mt-0.5" value="waveform" :checked="o.mode === 'waveform'" @change="set('mode', 'waveform')" />
        <span>Player with waveform <span class="block text-[10px] text-gray-400">Play button and the waveform of the track; click or drag it to seek. Falls back to the plain player when the file cannot be read (for example a URL of another site that does not allow it).</span></span>
      </label>
    </div>

    <div class="flex flex-col gap-1 text-xs text-gray-700">
      <label class="flex items-center gap-1.5"><input type="checkbox" :checked="o.controls" @change="set('controls', ($event.target as HTMLInputElement).checked)" /> {{ o.mode === 'waveform' ? 'Show the time' : 'Show the controls' }}</label>
      <label class="flex items-center gap-1.5"><input type="checkbox" :checked="o.loop" @change="set('loop', ($event.target as HTMLInputElement).checked)" /> Loop</label>
      <label class="flex items-center gap-1.5"><input type="checkbox" :checked="o.autoplay" @change="set('autoplay', ($event.target as HTMLInputElement).checked)" /> Start automatically</label>
      <p v-if="o.autoplay" class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-1">Browsers do not start audio with sound until the visitor has interacted with the page, so this often has no effect.</p>
      <label class="flex items-center gap-1.5">
        Load
        <select :value="o.preload" class="border rounded px-1 py-0.5 text-xs" @change="set('preload', ($event.target as HTMLSelectElement).value as AudioOptions['preload'])">
          <option value="none">only when played</option>
          <option value="metadata">duration only</option>
          <option value="auto">the whole file</option>
        </select>
      </label>
    </div>

    <div v-if="o.mode === 'waveform'" class="flex flex-col gap-1 text-xs text-gray-700 border-t pt-2">
      <span class="text-[10px] text-gray-500">Waveform</span>
      <label class="flex items-center gap-1.5">Waveform colour <input type="color" :value="hex(o.waveColor)" class="w-7 h-5 p-0 border rounded" @input="set('waveColor', ($event.target as HTMLInputElement).value)" /></label>
      <label class="flex items-center gap-1.5">Played part and button <input type="color" :value="hex(o.progressColor)" class="w-7 h-5 p-0 border rounded" @input="set('progressColor', ($event.target as HTMLInputElement).value)" /></label>
      <label class="flex items-center gap-1.5">Height (px)
        <input type="number" min="16" max="240" step="4" :value="o.height" class="w-16 border rounded px-1 py-0.5 text-xs" @change="set('height', Number(($event.target as HTMLInputElement).value))" />
      </label>
    </div>

    <MediaPickerModal v-if="showPicker" accept="audio" @select="onPicked" @close="showPicker = false" />
  </div>
</template>

<script setup lang="ts">
// Settings of the Audio element (ElementsClass.js Audio(); rendered by AudioPlayer.vue). Written into the element's
// own `options`, the source into `image.url` like Video and Image (a DAM asset path or any URL).
import { computed, ref } from 'vue'
import { AudioLines, FolderOpen } from '@lucide/vue'
import { useEditorStore } from '../../store/editor'
import { normalizeAudioOptions, type AudioOptions } from '../../scripts/audio-waveform'
import MediaPickerModal from '../MediaPickerModal.vue'

const editor = useEditorStore()
const showPicker = ref(false)

const el = computed(() => {
  const c = editor.current as any
  return c && c.element === 'audio' ? c : null
})
const o = computed<AudioOptions>(() => normalizeAudioOptions(el.value?.options))
const source = computed(() => el.value?.image?.url ?? '')

// The colour input only understands #rrggbb; anything else it shows as the default and the stored value is kept.
function hex(v: string): string { return /^#[0-9a-f]{6}$/i.test(v) ? v : '#6366f1' }

function set<K extends keyof AudioOptions>(key: K, value: AudioOptions[K]) {
  const c = el.value
  if (!c) return
  // store the complete, normalized set so a document never depends on defaults that may change later
  c.options = { ...normalizeAudioOptions(c.options), [key]: value }
}

function setSource(value: string) {
  const c = el.value
  if (!c) return
  c.image = { ...c.image, url: value.trim() || null }
}

function onPicked(path: string) {
  setSource(path)
  showPicker.value = false
}
</script>
