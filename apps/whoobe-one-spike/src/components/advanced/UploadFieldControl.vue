<template>
  <!-- the "File upload" section of Advanced (AdvancedPanel.vue) for a File Upload input -->
  <div v-if="el" class="flex flex-col gap-2 text-xs" data-testid="upload-field">
    <p class="text-[10px] text-gray-500">
      The visitor's file is uploaded when the form is sent, within the limits of the website (Dashboard &gt; Settings &gt; Form uploads: allowed
      types, size, number of files). Here you can only ask for less. Set the field's <b>name</b> in Attributes: the file is stored in the data
      class field of that name (a file field for one file, a list field for several).
    </p>

    <div class="flex flex-col gap-1">
      <span class="text-[10px] text-gray-500">Accept only these types (none ticked = everything the website allows)</span>
      <div class="flex flex-wrap gap-x-3 gap-y-1">
        <label v-for="ext in extensions" :key="ext" class="flex items-center gap-1 text-xs text-gray-700">
          <input type="checkbox" :checked="config.extensions?.includes(ext)" :data-testid="`upload-ext-${ext}`" @change="toggleExt(ext, ($event.target as HTMLInputElement).checked)" />
          .{{ ext }}
        </label>
      </div>
    </div>

    <label class="flex items-center gap-1.5 text-xs text-gray-700">
      Files
      <input type="number" min="1" max="10" step="1" :value="config.maxFiles ?? 1" class="w-14 border rounded px-1 py-0.5 text-xs" data-testid="upload-max-files" @change="setMaxFiles(Number(($event.target as HTMLInputElement).value))" />
      <span class="text-[10px] text-gray-400">more than one lets the visitor choose several</span>
    </label>

    <label class="flex flex-col gap-0.5 text-[10px] text-gray-500">
      Folder for this field's files (optional)
      <input :value="config.targetFolder ?? ''" type="text" placeholder="private/forms/cv" class="text-xs border rounded px-1.5 py-1 font-mono" data-testid="upload-folder" @change="setFolder(($event.target as HTMLInputElement).value)" />
      <span>In the asset library. Private (under <code>private/</code>) unless the website allows a public folder; otherwise the website's default is used.</span>
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SNIFFABLE_EXTENSIONS } from '@whoobe-cms/core'
import { useEditorStore } from '../../store/editor'

const editor = useEditorStore()

const el = computed(() => {
  const c = editor.current as any
  return c && c.element === 'input' && c.data?.attributes?.type === 'file' ? c : null
})
const extensions = [...SNIFFABLE_EXTENSIONS].sort()
const config = computed<{ extensions?: string[]; maxFiles?: number; targetFolder?: string }>(() => el.value?.uploadConfig ?? {})

function write(next: { extensions?: string[]; maxFiles?: number; targetFolder?: string }) {
  const c = el.value
  if (!c) return
  const clean: Record<string, unknown> = {}
  if (next.extensions?.length) clean.extensions = next.extensions
  if (next.maxFiles && next.maxFiles > 1) clean.maxFiles = next.maxFiles
  if (next.targetFolder) clean.targetFolder = next.targetFolder
  c.uploadConfig = clean
  // what the browser's file dialog offers, and whether it takes several files
  const attrs = { ...(c.data?.attributes ?? {}) }
  if (next.extensions?.length) attrs.accept = next.extensions.map((e) => '.' + e).join(',')
  else delete attrs.accept
  if (next.maxFiles && next.maxFiles > 1) attrs.multiple = true
  else delete attrs.multiple
  c.data = { ...(c.data ?? {}), attributes: attrs }
}

function toggleExt(ext: string, on: boolean) {
  const set = new Set(config.value.extensions ?? [])
  if (on) set.add(ext)
  else set.delete(ext)
  write({ ...config.value, extensions: [...set].sort() })
}
function setMaxFiles(n: number) {
  write({ ...config.value, maxFiles: Number.isFinite(n) ? Math.min(10, Math.max(1, Math.floor(n))) : 1 })
}
function setFolder(v: string) {
  write({ ...config.value, targetFolder: v.trim().replace(/^\/+|\/+$/g, '') || undefined })
}
</script>
