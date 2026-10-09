<template>
  <!-- shown as the "Download" accordion section of Advanced (AdvancedPanel.vue): the header and the folding come from there -->
  <div v-if="el" class="flex flex-col gap-2 text-xs">
    <label class="flex flex-col gap-0.5 text-[10px] text-gray-500">
      File: an asset of the library or any URL
      <div class="flex gap-1">
        <input
          :value="source"
          type="text"
          placeholder="/files/brochure.pdf  or  https://..."
          class="flex-1 min-w-0 text-xs border rounded px-1.5 py-1 font-mono"
          data-testid="download-source"
          @change="setSource(($event.target as HTMLInputElement).value)"
        />
        <button type="button" class="shrink-0 px-2 py-1 rounded border bg-gray-50 hover:border-indigo-400 text-gray-600 flex items-center gap-1" title="Browse the assets" data-testid="download-browse" @click="showPicker = true">
          <FolderOpen class="w-3.5 h-3.5" />
        </button>
      </div>
    </label>

    <p v-if="!source" class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-1" data-testid="download-empty">
      No file chosen: on the published site this stays a plain button that does nothing.
    </p>
    <p v-else-if="isPrivate" class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-1" data-testid="download-private">
      This asset is in a private folder: visitors are not allowed to read it, so the link would not work. Choose a public asset.
    </p>

    <label class="flex items-center gap-1.5 text-xs text-gray-700">
      <input type="checkbox" :checked="el.linkTarget === '_blank'" @change="setNewTab(($event.target as HTMLInputElement).checked)" />
      Open in a new tab (when the browser shows the file instead of saving it)
    </label>
    <p class="text-[10px] text-gray-400">The label, icon, colours, size and animation are set as for any button (Custom Classes, Style, the button icon in the toolbar).</p>

    <MediaPickerModal v-if="showPicker" @select="onPicked" @close="showPicker = false" />
  </div>
</template>

<script setup lang="ts">
// Settings of the Download element (ElementsClass.js Download(); rendered as a link with the `download` attribute by the
// preview and by the SDK renderer). The file is kept in the element's `image.url` like Audio, Image and Video: an asset of
// the library (resolved like any asset, and rewritten by the website export/import) or any URL.
import { computed, ref } from 'vue'
import { FolderOpen } from '@lucide/vue'
import { useEditorStore } from '../../store/editor'
import MediaPickerModal from '../MediaPickerModal.vue'

const editor = useEditorStore()
const showPicker = ref(false)

const el = computed(() => {
  const c = editor.current as any
  return c && c.tag === 'file' ? c : null
})
const source = computed(() => el.value?.image?.url ?? '')
// The library keeps private files under "private/": the public asset route refuses them without a session
const isPrivate = computed(() => /^\/?private(\/|$)/i.test(source.value))

function setSource(value: string) {
  const c = el.value
  if (!c) return
  c.image = { ...c.image, url: value.trim() || null }
}

function setNewTab(on: boolean) {
  const c = el.value
  if (!c) return
  c.linkTarget = on ? '_blank' : null
}

function onPicked(path: string) {
  setSource(path)
  showPicker.value = false
}
</script>
