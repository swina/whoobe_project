<template>
  <div class="fixed inset-0 z-[10002] overflow-auto" :class="deviceMode === 'desktop' ? 'bg-white' : 'bg-gray-300'">
    <div class="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white text-xs">
      <span class="font-semibold">Preview</span>

      <div class="flex items-center gap-1 ml-2">
        <button
          type="button"
          title="Desktop"
          class="px-1.5 py-1 rounded flex items-center gap-1"
          :class="deviceMode === 'desktop' ? 'bg-gray-700' : 'hover:bg-gray-800 text-gray-300'"
          @click="deviceMode = 'desktop'"
        >
          <Monitor class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          title="Tablet"
          class="px-1.5 py-1 rounded flex items-center gap-1"
          :class="deviceMode === 'tablet' ? 'bg-gray-700' : 'hover:bg-gray-800 text-gray-300'"
          @click="deviceMode = 'tablet'"
        >
          <Tablet class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          title="Mobile"
          class="px-1.5 py-1 rounded flex items-center gap-1"
          :class="deviceMode === 'mobile' ? 'bg-gray-700' : 'hover:bg-gray-800 text-gray-300'"
          @click="deviceMode = 'mobile'"
        >
          <Smartphone class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Orientation only means anything once a fixed device frame is
           actually showing - Desktop already just fills the real window. -->
      <div v-if="deviceMode !== 'desktop'" class="flex items-center gap-1 border-l border-gray-700 pl-2 ml-1">
        <button
          type="button"
          title="Portrait"
          class="px-1.5 py-1 rounded"
          :class="orientation === 'portrait' ? 'bg-gray-700' : 'hover:bg-gray-800 text-gray-300'"
          @click="orientation = 'portrait'"
        >
          <RectangleVertical class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          title="Landscape"
          class="px-1.5 py-1 rounded"
          :class="orientation === 'landscape' ? 'bg-gray-700' : 'hover:bg-gray-800 text-gray-300'"
          @click="orientation = 'landscape'"
        >
          <RectangleHorizontal class="w-3.5 h-3.5" />
        </button>
        <span class="text-gray-400 font-mono">{{ frameWidth }}×{{ frameHeight }}</span>
      </div>

      <div class="flex-1"></div>
      <span class="text-gray-400">Esc to close</span>
      <button class="flex items-center gap-1 px-2 py-1 rounded bg-gray-700 hover:bg-gray-600" @click="$emit('close')"><X class="w-3.5 h-3.5" /> Close</button>
    </div>

    <BlockContainerPreview v-if="doc && deviceMode === 'desktop'" :doc="doc" />

    <!-- Tablet/mobile: a fixed-size, real-DOM "device" frame at 1:1 scale
         (not a scaled-down thumbnail, not an iframe+srcdoc the way the
         source's own device switcher works - see this file's header
         comment for why) - its own independent scroll for content taller
         than the device, centered on a neutral backdrop so its actual
         edges are visible. -->
    <div v-else-if="doc" class="flex justify-center py-8 px-4">
      <div
        class="bg-white shadow-2xl overflow-y-auto shrink-0"
        :style="{ width: frameWidth + 'px', height: frameHeight + 'px' }"
      >
        <BlockContainerPreview :doc="doc" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Equivalent of the source's BlockWindowPreview.vue's own fullscreen mode
// (src/components/blocks/preview/BlockWindowPreview.vue) - a read-only
// render of the current document, with no editing chrome at all.
//
// The device-size switcher (Desktop/Tablet/Mobile, each with a portrait/
// landscape orientation) was originally left out entirely - the source's
// own version uses a live-srcdoc <iframe> plus zoom controls, and a real
// right-click "Save/HTML source/Build page" context menu neither of which
// this spike had a use for yet. Requested directly afterward, implemented
// deliberately differently from the source rather than porting its iframe
// approach: this app's Tailwind engine (@tailwindcss/browser, see main.ts)
// scans the live DOM of the page it's loaded into - an iframe is a
// separate browsing context/document, so making Tailwind classes actually
// render correctly inside a `srcdoc` iframe would mean loading and running
// that same script a second time, in a second context, just for this
// preview. Simpler and consistent with how this app already does every
// other "preview" (KitGalleryModal.vue's thumbnails, this same fullscreen
// mode): render the real component tree directly, just wrapped in a fixed-
// width/height div sized to a representative device viewport instead of
// filling the real window - genuinely the same DOM/CSS, at a real device
// width, not a simulation of one. Real tradeoff, noted rather than hidden:
// no actual device pixel ratio/user-agent emulation happens this way (a
// media query keyed on viewport width still resolves correctly, since the
// frame really is that many CSS pixels wide - only backdrop-behind-a-
// real-browser-chrome fidelity is what's missing).
//
// Device sizes are plain, common reference dimensions (a 768×1024 tablet,
// a 375×667 phone) - not configurable/precise per real device model, which
// is out of scope for what this needs to answer ("does this look broken
// at roughly tablet/phone width"), not a pixel-perfect device lab.
//
// Opened from BlockEditor.vue's own "Preview" button and the Alt+N hotkey
// (hotkeys.ts already emitted `editorBus.emit('preview', 'fullscreen')` on
// Alt+N since Phase 1 - this is the first thing that actually listens for
// it, matching hotkeys.ts's own comment that it "stays inert until the
// feature it targets is actually built"). The hotkey/hardcoded 'fullscreen'
// string just means "open the preview" - `deviceMode` starts at 'desktop'
// regardless of how it was opened, since there's no persisted preference
// for which device mode to reopen into.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Monitor, RectangleHorizontal, RectangleVertical, Smartphone, Tablet, X } from '@lucide/vue'
import type Element from '../scripts/ElementsClass.js'
import BlockContainerPreview from './preview/BlockContainerPreview.vue'

defineProps<{
  doc: InstanceType<typeof Element> | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

type DeviceMode = 'desktop' | 'tablet' | 'mobile'
type Orientation = 'portrait' | 'landscape'

const deviceMode = ref<DeviceMode>('desktop')
const orientation = ref<Orientation>('portrait')

const DEVICE_SIZES: Record<Exclude<DeviceMode, 'desktop'>, [number, number]> = {
  tablet: [768, 1024],
  mobile: [375, 667],
}

const frameWidth = computed(() => {
  if (deviceMode.value === 'desktop') return 0
  const [w, h] = DEVICE_SIZES[deviceMode.value]
  return orientation.value === 'portrait' ? w : h
})
const frameHeight = computed(() => {
  if (deviceMode.value === 'desktop') return 0
  const [w, h] = DEVICE_SIZES[deviceMode.value]
  return orientation.value === 'portrait' ? h : w
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>
