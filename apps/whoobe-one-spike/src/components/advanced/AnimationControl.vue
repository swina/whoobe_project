<template>
  <div class="flex flex-col gap-2">
    <label class="flex flex-col gap-0.5">
      <span class="text-gray-500">Name</span>
      <select class="w-full text-xs border rounded px-1.5 py-1" :value="gsap.animation ?? ''" @change="setField('animation', ($event.target as HTMLSelectElement).value || null)">
        <option value="">none</option>
        <option v-for="name in gsapEffects" :key="name" :value="name">{{ name }}</option>
      </select>
    </label>
    <label class="flex flex-col gap-0.5">
      <span class="text-gray-500">Ease</span>
      <select class="w-full text-xs border rounded px-1.5 py-1" :value="gsap.ease ?? ''" @change="setField('ease', ($event.target as HTMLSelectElement).value || null)">
        <option value="">default</option>
        <option v-for="ease in gsapEase" :key="ease" :value="ease">{{ ease }}</option>
      </select>
    </label>
    <label class="flex flex-col gap-0.5">
      <span class="text-gray-500">Duration (s)</span>
      <input type="number" min="0" step="0.1" class="w-full text-xs border rounded px-1.5 py-1" :value="gsap.duration" @change="setField('duration', Number(($event.target as HTMLInputElement).value) || 0)" />
    </label>
    <label class="flex flex-col gap-0.5">
      <span class="text-gray-500">Delay (s)</span>
      <input type="number" min="0" step="0.1" class="w-full text-xs border rounded px-1.5 py-1" :value="gsap.delay" @change="setField('delay', Number(($event.target as HTMLInputElement).value) || 0)" />
    </label>
    <label class="flex items-center gap-1.5">
      <input type="checkbox" :checked="!!gsap.trigger" @change="setField('trigger', ($event.target as HTMLInputElement).checked)" />
      <span class="text-gray-500">Play on hover (instead of on scroll into view)</span>
    </label>
    <button
      v-if="gsap.animation"
      type="button"
      class="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 self-start flex items-center gap-1"
      @click="editor.current && previewAnimation(editor.current)"
    >
      <Play class="w-3 h-3" /> Preview
    </button>
    <p class="text-[10px] text-gray-400">
      Plays once this element scrolls into view on the published page (or on hover, if checked above), with the Web Animations API - see
      <code>mountAnimation()</code> in <code>@whoobe-cms/renderer</code>.
    </p>
  </div>
</template>

<script setup lang="ts">
// Not a direct port of the reference's BlockAnimation.vue (name/ease/
// duration/delay only) - adds the `trigger` (hover-vs-scroll) checkbox the
// reference's own gsap.js `$animation` reads but BlockAnimation.vue never
// exposed a control for. Edits the same `editor.current.gsap` object
// FloatingToolbar.vue's existing animation-name picker + "Preview" button
// already read/write (FloatingToolbar.vue:376-383,992-1006) - both stay in
// sync for free, nothing here duplicates that wiring.
import { computed } from 'vue'
import { Play } from '@lucide/vue'
import animations from '../../scripts/animations.js'
import { previewAnimation } from '../../scripts/animation-actions'
import { useEditorStore } from '../../store/editor'

const editor = useEditorStore()
const gsapEffects: string[] = (animations as any).gsapEffects
const gsapEase: string[] = (animations as any).gsapEase

const gsap = computed(() => {
  const current = editor.current as any
  if (!current) return { animation: null, ease: null, duration: 0, delay: 0, trigger: false }
  if (!current.gsap) current.gsap = { animation: null, ease: null, duration: 0, delay: 0 }
  return current.gsap
})

function setField(field: 'animation' | 'ease' | 'duration' | 'delay' | 'trigger', value: unknown) {
  const current = editor.current as any
  if (!current) return
  if (!current.gsap) current.gsap = { animation: null, ease: null, duration: 0, delay: 0 }
  current.gsap[field] = value
}
</script>
