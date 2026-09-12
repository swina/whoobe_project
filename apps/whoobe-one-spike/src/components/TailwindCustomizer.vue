<template>
  <div class="flex-1 min-h-0 overflow-y-auto flex flex-col text-xs font-mono">
    <div v-if="!editor.current" class="p-3 text-gray-400">Select an element to customize</div>
    <template v-else>
      <template v-for="group in visibleGroups" :key="group.label">
        <button
          type="button"
          class="w-full flex items-center justify-between px-3 py-1.5 font-semibold capitalize text-gray-600 hover:bg-violet-500 hover:text-white border-b" :class="{ 'bg-violet-500 text-white': openGroup === group.label }"
          @click="openGroup = openGroup === group.label ? null : group.label"
        >
          {{ group.label }}
          <ChevronDown v-if="openGroup === group.label" class="w-3.5 h-3.5 text-gray-400" />
          <ChevronRight v-else class="w-3.5 h-3.5 text-gray-400" />
        </button>

        <div v-if="openGroup === group.label" class="p-2 space-y-3 border-b bg-gray-200">
          <template v-for="control in group.components" :key="control.attr">
            <component
              v-if="controlComponent(control.name)"
              :is="controlComponent(control.name)"
              :attr="control.attr"
              :title="control.title || control.attr"
              v-bind="control.prefix ? { prefix: control.prefix } : {}"
            />
          </template>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
// Port of whoobe-one-studio's src/components/blocks/tailwind/BlockTailwind.
// vue - the "customize any TailwindCSS utility" panel, driven by tw.groups.
// js (Phase 1, dormant until now) resolving to the control atoms in
// ./tailwind-controls/. One group open at a time (accordion), matching the
// source's own behavior.
//
// The button and its own conditional content div must live inside the same
// v-for iteration (one <template v-for> per group, not a v-for on the
// buttons plus one global v-if after the loop) - a real bug caught after
// the fact: with the content rendered separately after the whole button
// list, the expanded panel always appeared at the very bottom regardless
// of which group was actually clicked, instead of right underneath it.
//
// Color/BgGradient/BgGradientPresets/TextFont now real (this session's
// color+font audit and fix - see ColorControl.vue's own header comment for
// why the source's setColors()-based color lists never worked at all, and
// FontControl.vue's for why font selection was never routed through
// tw.classes.js in the first place). Still not ported: Position/BgPosition
// (`controlComponent()` still returns null for these - CSS position
// controls are a real feature with no equivalent built yet, not attempted
// here).
import { computed, ref } from 'vue'
import { ChevronDown, ChevronRight } from '@lucide/vue'
import twgroups from '../scripts/tw.groups.js'
import { useEditorStore } from '../store/editor'
import OptionsControl from './tailwind-controls/OptionsControl.vue'
import RangeControl from './tailwind-controls/RangeControl.vue'
import CheckboxControl from './tailwind-controls/CheckboxControl.vue'
import ButtonControl from './tailwind-controls/ButtonControl.vue'
import BorderColorControl from './tailwind-controls/BorderColorControl.vue'
import ColorControl from './tailwind-controls/ColorControl.vue'
import BgGradientControl from './tailwind-controls/BgGradientControl.vue'
import BgGradientPresetsControl from './tailwind-controls/BgGradientPresetsControl.vue'
import FontControl from './tailwind-controls/FontControl.vue'
import SemanticControl from './tailwind-controls/SemanticControl.vue'
import GridControl from './tailwind-controls/GridControl.vue'

interface TwControl {
  name: string
  attr: string
  title?: string
  prefix?: string
}
interface TwGroup {
  label: string
  filter?: string[]
  components: TwControl[]
}

const editor = useEditorStore()
const openGroup = ref<string | null>(null)

const groups = twgroups as unknown as TwGroup[]

// Not from tw.groups.js - a second place to reach the same setting
// FloatingToolbar.vue's own "Semantic tag" popover already controls (both
// read/write the identical `editor.current.semantic` field, so there's
// nothing to keep in sync between them). Gated on `type === 'container'`,
// unlike Custom Classes above - a leaf element's own `semantic` would be
// real, storable data, but nothing ever reads it (BlockElement.vue only
// ever renders its `element` field), so showing this control for one
// would silently do nothing, not just "not apply to every node" the way
// e.g. the grid-only ported groups already don't.
const SEMANTIC_GROUP: TwGroup = {
  label: 'semantic',
  components: [{ name: 'Semantic', attr: 'semantic', title: 'Renders as' }],
}

// Custom Classes and Data Binding (format bound value) used to live here
// as two more unconditional/conditional groups - moved to AdvancedPanel.vue
// instead (its "Custom Classes"/"Data Binding" sections), alongside every
// other per-element setting that isn't a plain TailwindCSS utility knob.

const visibleGroups = computed(() => {
  if (!editor.current) return []
  const tag = editor.current.tag
  const isContainer = (editor.current as any).type === 'container'
  return [...groups.filter((g) => !g.filter || g.filter.includes(tag)), ...(isContainer ? [SEMANTIC_GROUP] : [])]
})

const componentMap: Record<string, unknown> = {
  Options: OptionsControl,
  Width: OptionsControl,
  Height: OptionsControl,
  Range: RangeControl,
  Checkbox: CheckboxControl,
  Button: ButtonControl,
  BorderColor: BorderColorControl,
  Color: ColorControl,
  BgGradient: BgGradientControl,
  BgGradientPresets: BgGradientPresetsControl,
  TextFont: FontControl,
  Semantic: SemanticControl,
  Grid: GridControl,
}

function controlComponent(name: string) {
  return componentMap[name] ?? null
}
</script>
