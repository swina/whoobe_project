<template>
  <div class="flex-1 min-h-0 overflow-y-auto flex flex-col text-[10px] font-normal">
    <div v-if="!editor.current" class="p-3 text-gray-400">Select an element to edit its style, attributes or animation</div>
    <template v-else>
      <template v-for="section in sections" :key="section.key">
        <button
          type="button"
          class="w-full flex items-center justify-between px-3 py-1.5 font-semibold text-gray-600 hover:bg-violet-500 hover:text-white border-b border-slate-300" :class="{ 'bg-violet-500 text-white': openSection === section.key }"
          @click="openSection = openSection === section.key ? null : section.key"
        >
          {{ section.label }}
          <ChevronDown v-if="openSection === section.key" class="w-3.5 h-3.5 text-gray-400" />
          <ChevronRight v-else class="w-3.5 h-3.5 text-gray-400" />
        </button>
        <div v-if="openSection === section.key" class="p-2 border-b border-slate-300 bg-gray-200">
          <component :is="section.component" />
        </div>
      </template>
      <FormConfigControl v-if="(editor.current as any)?.tag === 'form'" />
      <SearchConfigControl v-if="(editor.current as any)?.tag === 'search'" />
    </template>
  </div>
</template>

<script setup lang="ts">
// Sidebar tab body for the "Advanced" tab (BlockEditor.vue) - closes out
// the remaining slice of the reference editor's own multi-tab sidebar
// (Elements/Tailwind/CSS/Attributes/.../Animation/AlpineJS/Tree - see
// docs/plans/cms/whoobe-one-spike-missing-features.md) that this port
// never carried over. One accordion section per feature, same interaction
// pattern as TailwindCustomizer.vue's group accordion, operating on the
// same `editor.current` every other sidebar/toolbar control already reads.
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronRight } from '@lucide/vue'
import { useEditorStore } from '../store/editor'
import StyleControl from './advanced/StyleControl.vue'
import InfoControl from './advanced/InfoControl.vue'
import AttributesControl from './advanced/AttributesControl.vue'
import AnimationControl from './advanced/AnimationControl.vue'
import FormFieldControl from './advanced/FormFieldControl.vue'
import FormConfigControl from './advanced/FormConfigControl.vue'
import SearchConfigControl from './advanced/SearchConfigControl.vue'
import AudioControl from './advanced/AudioControl.vue'
import DownloadControl from './advanced/DownloadControl.vue'
import UploadFieldControl from './advanced/UploadFieldControl.vue'
import CustomClassesControl from './tailwind-controls/CustomClassesControl.vue'

const editor = useEditorStore()
const openSection = ref<string | null>('customClasses')

// A checkbox input or an options-driven field (Select/RadioGroup, see
// ElementsClass.js) - every other section applies to any element, so this
// is the only conditional accordion entry. Form-submission config
// (formConfig) isn't one of these accordion sections at all anymore - see
// this template's own standalone <FormConfigControl> below, converted to a
// modal since a Form's config is a one-off dialog, not a per-element style
// knob glanced at repeatedly like Style/Attributes/Animation.
//
// Custom Classes moved here from TailwindCustomizer.vue's own accordion.
// AlpineJS directives and presets live in the AlpineJS panel (AlpinePanel.vue).
// Data binding, its transform, Nested list and Linked bindings live in the Data panel (DataPanel.vue).
// Selecting an Audio element opens its section; leaving it for another element must not leave a section that no longer
// exists "open" (nothing would show), so fall back to Custom Classes.
watch(
  () => (editor.current as any)?.id,
  () => {
    const cur = editor.current as any
    if (cur?.element === 'audio') openSection.value = 'audio'
    else if (cur?.tag === 'file') openSection.value = 'download'
    else if (cur?.element === 'input' && cur?.data?.attributes?.type === 'file') openSection.value = 'upload'
    else if (openSection.value === 'audio' || openSection.value === 'download' || openSection.value === 'upload') openSection.value = 'customClasses'
  },
  { immediate: true },
)

const sections = computed(() => {
  const current = editor.current as any
  const isCheckbox = current?.tag === 'input' && current?.type === 'checkbox'
  const isOptionsField = current?.tag === 'select' || current?.tag === 'radiogroup'
  return [
    ...(current?.sourceSnippetId ? [{ key: 'info', label: 'Info', component: InfoControl }] : []),
    // The Audio element's own settings (source, look, title): first, since for that element they are what matters
    ...(current?.element === 'audio' ? [{ key: 'audio', label: 'Audio', component: AudioControl }] : []),
    ...(current?.tag === 'file' ? [{ key: 'download', label: 'Download', component: DownloadControl }] : []),
    ...(current?.element === 'input' && current?.data?.attributes?.type === 'file' ? [{ key: 'upload', label: 'File upload', component: UploadFieldControl }] : []),
    { key: 'customClasses', label: 'Custom Classes', component: CustomClassesControl },
    { key: 'style', label: 'Style', component: StyleControl },
    { key: 'attributes', label: 'Attributes', component: AttributesControl },
    { key: 'animation', label: 'Animation', component: AnimationControl },
    ...(isCheckbox || isOptionsField ? [{ key: 'field', label: 'Field', component: FormFieldControl }] : []),
  ]
})
</script>
