<template>
  <div class="shrink-0 overflow-y-auto flex flex-col text-sm">
    <div v-if="!editor.current" class="p-3 text-gray-400">Select an element to edit its style, attributes, animation or AlpineJS directives</div>
    <template v-else>
      <template v-for="section in sections" :key="section.key">
        <button
          type="button"
          class="w-full flex items-center justify-between px-3 py-1.5 font-semibold text-gray-600 hover:bg-violet-500 hover:text-white border-b" :class="{ 'bg-violet-500 text-white': openSection === section.key }"
          @click="openSection = openSection === section.key ? null : section.key"
        >
          {{ section.label }}
          <ChevronDown v-if="openSection === section.key" class="w-3.5 h-3.5 text-gray-400" />
          <ChevronRight v-else class="w-3.5 h-3.5 text-gray-400" />
        </button>
        <div v-if="openSection === section.key" class="p-2 border-b bg-gray-200">
          <component :is="section.component" />
        </div>
      </template>
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
import { ref } from 'vue'
import { ChevronDown, ChevronRight } from '@lucide/vue'
import { useEditorStore } from '../store/editor'
import StyleControl from './advanced/StyleControl.vue'
import AttributesControl from './advanced/AttributesControl.vue'
import AnimationControl from './advanced/AnimationControl.vue'
import AlpineControl from './advanced/AlpineControl.vue'

const editor = useEditorStore()
const openSection = ref<string | null>('style')

const sections = [
  { key: 'style', label: 'Style', component: StyleControl },
  { key: 'attributes', label: 'Attributes', component: AttributesControl },
  { key: 'animation', label: 'Animation', component: AnimationControl },
  { key: 'alpine', label: 'AlpineJS', component: AlpineControl },
]
</script>
